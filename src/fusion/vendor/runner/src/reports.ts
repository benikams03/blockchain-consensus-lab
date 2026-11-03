// Projections pédagogiques des objets réellement produits. Aucun vote n'est inventé à partir du calendrier.
import type { Block, Checkpoint } from '../../contracts/src/index.js';
import type { PosHarness } from './engine.js';
import { collectMetrics } from './metrics.js';

function ancestorIds(headId: string, blocks: ReadonlyMap<string, Block>): Set<string> {
    const result = new Set<string>();
    let block = blocks.get(headId);
    while (block && !result.has(block.id)) {
        result.add(block.id);
        block = block.header.parentId === null ? undefined : blocks.get(block.header.parentId);
    }
    return result;
}

export function buildPedagogicalReport(run: PosHarness) {
    const observerNodeId = collectMetrics(run).observerNodeId;
    const observer = run.nodes.get(observerNodeId)!;
    // La vue globale sert à raconter l'expérience, pas à modifier ce que connaît chaque machine.
    const blocks = new Map<string, Block>([[run.genesis.id, run.genesis]]);
    for (const node of run.nodes.values()) for (const [id, block] of node.blocks) blocks.set(id, block);
    for (const message of run.messages.values()) {
        if (message.payload.kind === 'proposal' || message.payload.kind === 'blockResponse') {
            blocks.set(message.payload.block.id, message.payload.block);
        }
    }
    const proposedIds = new Set(run.observations.filter(event => event.type === 'BLOCK_PROPOSED')
        .map(event => String(event.payload.blockId)));
    const retained = ancestorIds(observer.headId, observer.blocks);
    const finalized = ancestorIds(observer.finalized.blockId, observer.blocks);
    // Un bloc seulement construit dans un test, sans proposition ni réception, n'apparaît pas dans ce journal.
    const visibleIds = new Set([run.genesis.id, ...proposedIds, ...retained]);
    const visible = [...visibleIds].map(id => blocks.get(id)).filter((block): block is Block => !!block)
        .sort((a, b) => a.header.proposedAtMs - b.header.proposedAtMs || a.header.height - b.header.height || a.id.localeCompare(b.id));
    const atHeight = new Map<number, number>();
    for (const block of visible) atHeight.set(block.header.height, (atHeight.get(block.header.height) ?? 0) + 1);
    const labels = new Map<string, string>();
    for (const block of visible) {
        // Deux blocs de même hauteur reçoivent des références différentes : une fourche ne doit pas être masquée.
        const suffix = atHeight.get(block.header.height)! > 1 ? `-${block.id.slice(0, 8)}` : '';
        labels.set(block.id, `B${block.header.height}${suffix}`);
    }
    const blockLabel = (id: string) => labels.get(id) ?? `inconnu-${id.slice(0, 8)}`;
    const checkpointLabel = (point: Checkpoint) => `R${point.epoch}/${blockLabel(point.blockId)}`;
    const aliases = run.config.validators.map((node, index) => ({ alias: `N${String(index + 1).padStart(2, '0')}`, nodeId: node.id, stake: node.stake }));
    const aliasFor = new Map(aliases.map(node => [node.nodeId, node.alias]));
    const blockRows = visible.map(block => ({
        bloc: blockLabel(block.id),
        hauteur: block.header.height,
        proposant: block.header.height === 0 ? 'initialisation' : block.header.producerId,
        tour: block.header.height === 0 ? 0 : block.header.consensus.kind === 'pos' ? block.header.consensus.slot + 1 : 0,
        tempsMs: block.header.proposedAtMs,
        parent: block.header.parentId === null ? 'aucun' : blockLabel(block.header.parentId),
        paiements: block.transactions.length,
        transactions: block.transactions.map(tx => `${tx.from} > ${tx.to} : ${tx.amount} (nonce ${tx.nonce})`).join(' ; ') || 'bloc vide',
        état: finalized.has(block.id) ? 'finalisé' : retained.has(block.id) ? 'retenu, non finalisé' : 'hors chaîne observée',
        blockId: block.id,
    }));

    // Une signature envoyée à onze voisins reste un seul vote. Les retransmissions ne créent pas de voix.
    const records = [...run.voteRecords.values()].sort((a, b) => a.signedAtMs - b.signedAtMs || a.vote.signerId.localeCompare(b.vote.signerId) || a.vote.id.localeCompare(b.vote.id));
    const headRecords = records.filter(record => record.vote.payload.kind === 'headVote');
    const linkRecords = records.filter(record => record.vote.payload.kind === 'linkVote');
    const voteRows = records.map(record => {
        const vote = record.vote, payload = vote.payload;
        const source = payload.kind === 'linkVote' ? checkpointLabel(payload.source) : '';
        const target = payload.kind === 'linkVote' ? checkpointLabel(payload.target) : blockLabel(payload.blockId);
        return {
            type: payload.kind === 'headVote' ? 'choix de chaîne' : 'finalité',
            nœud: vote.signerId,
            mise: run.config.validators.find(node => node.id === vote.signerId)!.stake,
            tour: payload.kind === 'headVote' ? payload.slot + 1 : '',
            époqueCible: payload.kind === 'linkVote' ? payload.target.epoch : '',
            source,
            cible: target,
            signéÀMs: record.signedAtMs,
            premierEnvoiMs: record.firstSentAtMs ?? '',
            diffusion: record.firstSentAtMs === null ? 'gardé localement' : 'envoyé',
            voteId: vote.id,
            sourceBlockId: payload.kind === 'linkVote' ? payload.source.blockId : '',
            targetBlockId: payload.kind === 'linkVote' ? payload.target.blockId : payload.blockId,
        };
    });
    const headCell = (slot: number, nodeId: string): string => {
        const votes = headRecords.filter(record => record.vote.signerId === nodeId
            && record.vote.payload.kind === 'headVote' && record.vote.payload.slot === slot);
        return [...new Set(votes.map(record => {
            const payload = record.vote.payload;
            return payload.kind === 'headVote' ? blockLabel(payload.blockId) + (record.firstSentAtMs === null ? '*' : '') : '';
        }))].join(' / ') || '—';
    };
    const headRounds = Array.from({ length: Math.min(run.config.maxSlots, Math.ceil(run.windowEndMs / run.config.slotDurationMs)) }, (_, slot) => ({
        tour: slot + 1,
        choices: Object.fromEntries(aliases.map(node => [node.nodeId, headCell(slot, node.nodeId)])),
    }));
    const targetEpochs = [...new Set(linkRecords.map(record => record.vote.payload.kind === 'linkVote' ? record.vote.payload.target.epoch : 0))].sort((a, b) => a - b);
    const linkRounds = targetEpochs.map(epoch => ({
        repère: epoch,
        choices: Object.fromEntries(aliases.map(node => {
            const votes = linkRecords.filter(record => record.vote.signerId === node.nodeId
                && record.vote.payload.kind === 'linkVote' && record.vote.payload.target.epoch === epoch);
            const cell = [...new Set(votes.map(record => {
                const payload = record.vote.payload;
                return payload.kind === 'linkVote' ? `${checkpointLabel(payload.source)} > ${checkpointLabel(payload.target)}${record.firstSentAtMs === null ? '*' : ''}` : '';
            }))].join(' / ') || '—';
            return [node.nodeId, cell];
        })),
    }));
    const participation = aliases.map(node => {
        const own = records.filter(record => record.vote.signerId === node.nodeId);
        const count = (kind: 'headVote' | 'linkVote', sentOnly = false) => own.filter(record => record.vote.payload.kind === kind && (!sentOnly || record.firstSentAtMs !== null)).length;
        return { nœud: node.nodeId, mise: node.stake,
            blocsProposés: blockRows.filter(block => block.proposant === node.nodeId && proposedIds.has(block.blockId)).length,
            choixSignés: count('headVote'), choixEnvoyés: count('headVote', true),
            finalitéSignés: count('linkVote'), finalitéEnvoyés: count('linkVote', true) };
    });

    // Ici seulement, on affiche les voix effectivement réunies dans une preuve acceptée par l'observateur.
    // Les votes simplement signés dans la vue globale ne prouvent pas qu'ils ont été reçus ou comptés.
    const certificateRows = run.observations.filter(event => event.nodeId === observerNodeId && event.type === 'CHECKPOINT_JUSTIFIED').map(event => {
        const certificate = run.certificates.get(String(event.payload.certificateId))!;
        const finalization = run.observations.find(other => other.nodeId === observerNodeId && other.type === 'CHECKPOINT_FINALIZED' && other.payload.certificateId === certificate.id);
        const voters = [...new Set(certificate.votes.map(vote => vote.signerId))];
        return { tempsMs: event.simTimeMs, repèreAccepté: checkpointLabel(certificate.target),
            partieVerrouillée: finalization ? checkpointLabel(certificate.source) : 'aucune nouvelle',
            poids: voters.reduce((sum, id) => sum + run.config.validators.find(node => node.id === id)!.stake, 0),
            total: run.config.validators.reduce((sum, node) => sum + node.stake, 0),
            votants: voters.map(id => aliasFor.get(id) ?? id).join(', '), certificateId: certificate.id };
    });
    const transactionRows = visible.flatMap(block => block.transactions.map(tx => ({ bloc: blockLabel(block.id), proposant: block.header.producerId,
        émetteur: tx.from, destinataire: tx.to, montant: tx.amount, nonce: tx.nonce, transactionId: tx.id, blockId: block.id })));
    return { observerNodeId, aliases, retainedBlockCount: retained.size, producedBlockCount: proposedIds.size,
        blockRows, participation, transactionRows, voteRows, headRounds, linkRounds, certificateRows };
}

export type PedagogicalReport = ReturnType<typeof buildPedagogicalReport>;

// Les groupes limitent la largeur du terminal, même avec douze machines ou davantage.
function groups<T>(items: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function printPedagogicalReport(report: PedagogicalReport): void {
    console.log(`\nBLOCS : la chaîne retenue par ${report.observerNodeId} contient ${report.retainedBlockCount} blocs, genesis compris.`);
    console.log(`${report.producedBlockCount} nouvelles propositions distinctes observées. B0 = bloc de départ ; B1 = bloc de hauteur 1.`);
    console.table(report.blockRows.map(({ blockId, ...row }) => row));
    console.log('\nQUI A PROPOSÉ LES BLOCS ET SIGNÉ LES VOTES ?');
    console.table(report.participation);
    console.log('\nVOTES POUR CHOISIR LA CHAÎNE : une case B7 signifie « ce nœud choisit le bloc B7 à ce tour ».');
    console.log('— = aucun vote signé observé ; * = vote signé mais gardé localement. Une absence ne signifie pas un vote contre.');
    console.log('Un vote de choix de chaîne ne finalise pas le bloc. Ces tableaux montrent les signatures, pas leur réception par chaque voisin.');
    for (const group of groups(report.aliases, 6)) {
        console.log(group.map(node => `${node.alias} = ${node.nodeId}`).join(' ; '));
        console.table(report.headRounds.map(round => ({ tour: round.tour, ...Object.fromEntries(group.map(node => [node.alias, round.choices[node.nodeId]])) })));
    }
    console.log('\nVOTES DE FINALITÉ : R4/B16 > R5/B20 signifie « je soutiens la continuation du repère 4 au repère 5 ».');
    console.log('R = numéro de repère d’époque ; B = bloc associé. Plusieurs liens dans une case restent visibles.');
    for (const group of groups(report.aliases, 3)) {
        console.log(group.map(node => `${node.alias} = ${node.nodeId}`).join(' ; '));
        console.table(report.linkRounds.map(round => ({ repère: round.repère, ...Object.fromEntries(group.map(node => [node.alias, round.choices[node.nodeId]])) })));
    }
    console.log(`\nACCORDS VÉRIFIÉS PAR ${report.observerNodeId} : signataires réellement présents dans les certificats acceptés.`);
    if (report.certificateRows.length) console.table(report.certificateRows.map(({ certificateId, ...row }) => row));
    else console.log('Aucun nouvel accord de justification vérifié pendant cette expérience.');
}

// Le séparateur ; et le BOM UTF-8 facilitent l'ouverture des noms français dans Excel sous Windows.
export function rowsToCsv(rows: readonly Record<string, unknown>[]): string {
    if (!rows.length) return '\uFEFF';
    const keys = Object.keys(rows[0]);
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return '\uFEFF' + [keys.map(quote).join(';'), ...rows.map(row => keys.map(key => quote(row[key])).join(';'))].join('\r\n') + '\r\n';
}
