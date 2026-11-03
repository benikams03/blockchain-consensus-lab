import type { PosPayload, SignedMessage } from './index.js';
// Validation à l'entrée du moteur ; TypeScript seul ne valide pas le JSON reçu.
// Un JSON doit réellement être un objet, pas un tableau ni null : les types TypeScript ne suffisent pas à l’exécution.
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
// Exige exactement les champs prévus pour refuser les variantes ambiguës ou les ajouts non reconnus.
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
// Un entier sûr non négatif évite les montants fractionnaires et les dépassements de précision.
const uint = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
// Accepte nos noms de comptes ou de machines, limités à 64 caractères ; ce ne sont pas des adresses Ethereum.
const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
// Une empreinte SHA-256 hexadécimale contient exactement 64 caractères.
const hash = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
// Contrôle ici le format base64 ; l’authenticité est vérifiée ensuite avec la clé publique.
const signature = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(v);
// Un checkpoint contient exactement une époque et une empreinte de bloc.
function checkpoint(v: unknown): boolean {
    return object(v) && exact(v, ['epoch', 'blockId']) && uint(v.epoch) && hash(v.blockId);
}
// Contrôle les champs d’un paiement avant toute vérification de signature ou de solde.
function transaction(v: unknown): boolean {
    return object(v) && exact(v, ['version', 'id', 'from', 'to', 'amount', 'nonce', 'signature'])
        && v.version === 1 && hash(v.id) && id(v.from) && id(v.to)
        && uint(v.amount) && (v.amount as number) > 0 && uint(v.nonce) && signature(v.signature);
}
// Vérifie la structure et borne le nombre de transactions pour limiter les entrées excessives.
function block(v: unknown): boolean {
    if (!object(v) || !exact(v, ['id', 'header', 'transactions', 'producerSignature']) || !hash(v.id)
        || !signature(v.producerSignature) || !object(v.header) || !Array.isArray(v.transactions)
        || v.transactions.length > 100 || !v.transactions.every(transaction))
        return false;
    const h = v.header, c = h.consensus;
    return exact(h, ['protocolVersion', 'protocol', 'parentId', 'height', 'producerId', 'proposedAtMs', 'txIds', 'consensus'])
        && h.protocolVersion === 1 && h.protocol === 'pos' && hash(h.parentId) && uint(h.height)
        && id(h.producerId) && uint(h.proposedAtMs) && Array.isArray(h.txIds) && h.txIds.length <= 100 && h.txIds.every(hash)
        && object(c) && exact(c, ['kind', 'slot']) && c.kind === 'pos' && uint(c.slot);
}
// Choisit le schéma correspondant au type annoncé ; un type inconnu est rejeté.
export function isPosPayload(v: unknown): v is PosPayload {
    if (!object(v))
        return false;
    switch (v.kind) {
        case 'transaction': return exact(v, ['kind', 'transaction']) && transaction(v.transaction);
        case 'proposal':
        case 'blockResponse': return exact(v, ['kind', 'block']) && block(v.block);
        case 'headVote': return exact(v, ['kind', 'slot', 'blockId']) && uint(v.slot) && hash(v.blockId);
        case 'linkVote': return exact(v, ['kind', 'source', 'target']) && checkpoint(v.source) && checkpoint(v.target);
        case 'requestBlock': return exact(v, ['kind', 'blockId']) && hash(v.blockId);
        default: return false;
    }
}
// Vérifie l’enveloppe réseau complète ; le domaine, le hash et la signature seront ensuite authentifiés.
export function isPosMessage(v: unknown): v is SignedMessage {
    return object(v) && exact(v, ['protocolVersion', 'protocol', 'domain', 'signerId', 'payload', 'id', 'signature'])
        && v.protocolVersion === 1 && v.protocol === 'pos' && hash(v.domain) && id(v.signerId)
        && isPosPayload(v.payload) && hash(v.id) && signature(v.signature);
}
// Le registre commun et les autres protocoles réutilisent exactement ce schéma de paiement.
export { transaction as isTransaction };
