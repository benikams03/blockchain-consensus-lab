import type { PosHarness } from './engine.js';
import { isAncestor } from '../../core/src/index.js';
// Résume seulement les délais effectivement atteints : médiane usuelle et p95 au rang supérieur le plus proche.
function distribution(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
    return { count: n, medianMs: n ? (n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null,
        p95Ms: n ? sorted[Math.ceil(0.95 * n) - 1] : null, percentileMethod: 'nearest-rank' };
}
// Calcule les mesures de chaîne depuis la vue du même observateur pendant toute l'expérience.
export function collectMetrics(run: PosHarness) {
    // Un observateur explicite est préféré ; à défaut, on prend une machine en ligne, ou la première si toutes sont arrêtées.
    const observerNodeId = run.scenario.observerNodeId ?? run.config.validators.find(n => !run.scenario.offline.includes(n.id))?.id ?? run.config.validators[0].id;
    const node = run.nodes.get(observerNodeId)!;
    const submitted = new Map<string, number>(), included = new Map<string, number>(), finalized = new Map<string, number>();
    // Récupère les paiements uniques dans le passé d'un bloc connu de cet observateur.
    const branchTransactions = (headId: string): Set<string> => {
        const ids = new Set<string>();
        let block = node.blocks.get(headId);
        while (block) {
            for (const tx of block.transactions)
                ids.add(tx.id);
            block = block.header.parentId === null ? undefined : node.blocks.get(block.header.parentId);
        }
        return ids;
    };
    for (const event of run.observations) {
        // L'instant d'émission est enregistré une seule fois pour chaque paiement, avant de calculer ses délais.
        if (event.type === 'TX_SUBMITTED' && typeof event.payload.txId === 'string' && !submitted.has(event.payload.txId))
            submitted.set(event.payload.txId, event.simTimeMs);
        // Un événement chez un voisin ne donne pas artificiellement cette connaissance à l'observateur.
        if (event.nodeId !== observerNodeId)
            continue;
        // L'inclusion est mesurée lorsque le paiement entre pour la première fois dans la branche choisie.
        if (event.type === 'HEAD_CHANGED' && Array.isArray(event.payload.addedBlockIds)) {
            for (const id of event.payload.addedBlockIds)
                for (const tx of node.blocks.get(id)?.transactions ?? [])
                    if (!included.has(tx.id))
                        included.set(tx.id, event.simTimeMs);
        }
        // Une transaction devient finalisée quand elle appartient au passé du checkpoint finalisé.
        if (event.type === 'CHECKPOINT_FINALIZED') {
            const cp = event.payload.checkpoint as {
                blockId: string;
            };
            for (const id of branchTransactions(cp.blockId))
                if (!finalized.has(id))
                    finalized.set(id, event.simTimeMs);
        }
    }
    const canonical = branchTransactions(node.headId), finalizedIds = branchTransactions(node.finalized.blockId);
    // Le débit utilise la durée virtuelle fixée par la configuration, pas la vitesse de ton ordinateur.
    const durationMs = run.windowEndMs;
    const localEvents = run.observations.filter(e => e.nodeId === observerNodeId);
    const messagesSent = run.observations.filter(e => e.type === 'MESSAGE_SENT').length;
    const messagesDelivered = run.observations.filter(e => e.type === 'MESSAGE_DELIVERED').length;
    const messagesDropped = run.observations.filter(e => e.type === 'MESSAGE_DROPPED').length;
    const known = [...node.blocks.values()].filter(b => b.header.height > 0);
    // Le ratio hors branche ne porte que sur les blocs connus de l'observateur ; le genesis est exclu.
    const orphanCount = known.filter(b => !isAncestor(node.blocks, b.id, node.headId)).length;
    const delays = (times: Map<string, number>) => [...times].filter(([id]) => submitted.has(id)).map(([id, time]) => time - submitted.get(id)!);
    return { observerNodeId, windowMs: durationMs, submittedTransactions: submitted.size,
        retainedTransactions: canonical.size, finalizedTransactions: finalizedIds.size,
        // Débit retenu : paiements uniques encore dans la branche à la fin, divisés par la durée en secondes.
        retainedTransactionsPerSecond: canonical.size / (durationMs / 1000), finalizedTransactionsPerSecond: finalizedIds.size / (durationMs / 1000),
        // Inclut aussi les échecs : une moyenne des seuls paiements réussis masquerait un blocage.
        unfinishedFinalityRatio: submitted.size ? [...submitted.keys()].filter(id => !finalizedIds.has(id)).length / submitted.size : null,
        firstInclusion: distribution(delays(included)), firstFinality: distribution(delays(finalized)),
        reorganizationCount: localEvents.filter(e => e.type === 'HEAD_CHANGED' && Array.isArray(e.payload.removedBlockIds) && e.payload.removedBlockIds.length > 0).length,
        knownBlocks: known.length, offBranchBlocks: orphanCount, offBranchRatio: known.length ? orphanCount / known.length : null,
        // Conserve les messages ni livrés ni perdus à la fermeture de la fenêtre, au lieu de les déclarer livrés.
        messagesSent, messagesDelivered, messagesDropped, inFlightAtEnd: messagesSent - messagesDelivered - messagesDropped,
        faultEvidenceCount: run.evidence.size, safetyViolationCount: run.observations.filter(e => e.type === 'SAFETY_VIOLATION').length };
}
