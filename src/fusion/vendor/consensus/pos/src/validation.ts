import type { Block, Ledger, PosConfig, Transaction } from '../../../contracts/src/index.js';
import { applyTransactions, blockId, integer, ledgerAt, proposerForSlot, txId, verifyId } from '../../../core/src/index.js';
// Compatibilité de l'API PoS : la validation des paiements appartient au registre commun.
export { verifyTransactionEnvelope } from '../../../core/src/ledger.js';
// Vérifie un bloc reçu uniquement avec les données locales et les règles publiques de cette expérience.
export function verifyPosBlock(b: Block, known: ReadonlyMap<string, Block>, config: PosConfig, genesis: Ledger, keys: ReadonlyMap<string, string>, nowMs: number): boolean {
    try {
        // Le parent doit être connu avant de vérifier la hauteur et le registre hérité.
        const h = b.header, parent = h.parentId === null ? undefined : known.get(h.parentId);
        const n = config.validators.find(n => n.id === h.producerId);
        // Le bloc doit appartenir au protocole attendu et provenir d'un validateur configuré.
        if (!parent || !n || h.protocolVersion !== 1 || h.protocol !== 'pos' || h.consensus.kind !== 'pos'
            // Une nouvelle hauteur vaut exactement celle du parent + 1 ; un créneau futur n'est pas recevable.
            || !integer(h.height, 1) || h.height !== parent.header.height + 1
            || !integer(h.consensus.slot, 0, config.maxSlots - 1) || h.consensus.slot > Math.floor(nowMs / config.slotDurationMs)
            || (parent.header.height > 0 && parent.header.consensus.kind === 'pos' && h.consensus.slot <= parent.header.consensus.slot)
            // Même une signature authentique ne donne pas le droit de proposer en dehors de son créneau.
            || proposerForSlot(config, h.consensus.slot) !== h.producerId
            // L'horodatage reste dans son créneau et ne peut pas annoncer un instant encore futur.
            || !integer(h.proposedAtMs) || h.proposedAtMs < h.consensus.slot * config.slotDurationMs
            || h.proposedAtMs >= (h.consensus.slot + 1) * config.slotDurationMs || h.proposedAtMs > nowMs
            // Recalcule le hash et vérifie la signature du proposant : modifier le contenu invalide ces contrôles.
            || b.id !== blockId(h) || !verifyId(b.id, b.producerSignature, n.publicKey)
            // Contrôle la capacité du bloc et l'ordre exact des transactions annoncées dans son en-tête.
            || b.transactions.length > config.blockCapacity || h.txIds.length !== b.transactions.length
            || h.txIds.some((id, i) => id !== b.transactions[i].id))
            return false;
        // Rejoue toutes les transactions sur le registre du parent ; une seule erreur fait échouer le bloc entier.
        applyTransactions(ledgerAt(parent.id, known, genesis, keys), b.transactions, keys);
        return true;
    }
    catch {
        return false;
    }
}
