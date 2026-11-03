import type { Block, Ledger, Transaction } from '../../contracts/src/index.js';
import { compareId, txId, verifyId } from './crypto.js';
import { integer } from './model.js';
import { isTransaction } from '../../contracts/src/schema.js';
// Une copie est retournée : une erreur n'altère jamais le registre du parent.
// Exécute les paiements d'un bloc sur une copie : un paiement invalide fait refuser le bloc entier.
export function applyTransactions(parent: Ledger, txs: readonly Transaction[], accountKeys: ReadonlyMap<string, string>): Ledger {
    // Copie aussi chaque solde : modifier un compte dans cette copie ne modifie pas le registre parent.
    const next = new Map([...parent].map(([id, a]) => [id, { ...a }]));
    for (const tx of txs) {
        // Recherche les deux comptes de paiement et la clé publique de l'émetteur ; aucun validateur n'est débité ici.
        const from = next.get(tx.from), to = next.get(tx.to), key = accountKeys.get(tx.from);
        // Contrôle signature, montant, fonds et nonce exact pour empêcher les paiements falsifiés ou exécutés deux fois.
        if (tx.version !== 1 || !from || !to || !key || !integer(tx.amount, 1) || !integer(tx.nonce)
            || tx.id !== txId(tx) || !verifyId(tx.id, tx.signature, key)
            || tx.nonce !== from.nextNonce || from.balance < tx.amount
            || !integer(from.nextNonce + 1) || (tx.from !== tx.to && !integer(to.balance + tx.amount))) {
            throw new Error('TX_INVALID');
        }
        if (tx.from !== tx.to) {
            // Débite le compte utilisateur qui paie : sa mise de validateur éventuelle n'intervient pas.
            from.balance -= tx.amount;
            // Crédite le destinataire du même montant : aucune pièce n'est créée par ce paiement.
            to.balance += tx.amount;
        }
        // Le prochain paiement de cet émetteur devra utiliser le numéro suivant.
        from.nextNonce += 1;
    }
    return next;
}
// Reconstruit les soldes correspondant à une branche précise, utile après un changement de tête.
export function ledgerAt(headId: string, blocks: ReadonlyMap<string, Block>, genesis: Ledger, keys: ReadonlyMap<string, string>): Ledger {
    const branch: Block[] = [];
    let b = blocks.get(headId);
    // Garde les blocs déjà parcourus pour refuser une boucle de parents mal formée.
    const visited = new Set<string>();
    while (b && b.header.parentId !== null) {
        if (visited.has(b.id))
            throw new Error('BLOCK_CYCLE');
        visited.add(b.id);
        branch.push(b);
        b = blocks.get(b.header.parentId);
    }
    if (!b)
        throw new Error('PARENT_UNKNOWN');
    let state = genesis;
    // Rejoue du genesis vers la tête, dans l'ordre réel des paiements.
    for (const block of branch.reverse())
        state = applyTransactions(state, block.transactions, keys);
    return state;
}
// Choisit uniquement des paiements exécutables sur le parent du prochain bloc.
export function selectTransactions(parent: Ledger, candidates: readonly Transaction[], capacity: number, keys: ReadonlyMap<string, string>): Transaction[] {
    let state = parent;
    const selected: Transaction[] = [], remaining = new Map(candidates.map(t => [t.id, t]));
    let changed = true;
    // Réessaie les candidats après chaque progrès : un nonce futur peut devenir utilisable après son prédécesseur.
    while (changed && selected.length < capacity) {
        changed = false;
        for (const tx of [...remaining.values()].sort((a, b) => compareId(a.id, b.id))) {
            if (selected.length >= capacity)
                break;
            try {
                state = applyTransactions(state, [tx], keys);
                // Ajoute le paiement au bloc seulement après l'avoir exécuté avec succès dans l'état provisoire.
                selected.push(tx);
                remaining.delete(tx.id);
                changed = true;
            }
            catch { /* Un nonce futur sera réessayé après les autres transactions. */ }
        }
    }
    return selected;
}

// Vérifie l'identité et la signature d'un paiement avant son admission au mempool ; le nonce exact sera contrôlé à l'exécution.
export function verifyTransactionEnvelope(tx: Transaction, keys: ReadonlyMap<string, string>): boolean {
    try {
        return isTransaction(tx) && tx.version === 1 && keys.has(tx.from) && keys.has(tx.to) && integer(tx.amount, 1)
            && integer(tx.nonce) && tx.id === txId(tx) && verifyId(tx.id, tx.signature, keys.get(tx.from)!);
    }
    catch {
        return false;
    }
}
