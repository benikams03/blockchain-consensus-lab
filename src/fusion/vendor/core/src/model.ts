import type { Block, Checkpoint, NodeConfig, PosConfig } from '../../contracts/src/index.js';
import { compareId, hash } from './crypto.js';
import { createSeededRandom, selectProposer } from './random.js';
// Une époque et un bloc forment ensemble un checkpoint ; deux époques peuvent référencer le même bloc.
export const checkpointKey = (c: Checkpoint): string => `${c.epoch}:${c.blockId}`;
export const sameCheckpoint = (a: Checkpoint, b: Checkpoint): boolean => checkpointKey(a) === checkpointKey(b);
// Refuse les fractions, les nombres négatifs interdits et les dépassements de précision JavaScript.
export const integer = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number => Number.isSafeInteger(n) && (n as number) >= min && (n as number) <= max;
// Additionne toutes les mises configurées, y compris celles des validateurs arrêtés.
export function totalStake(nodes: readonly NodeConfig[]): number { return nodes.reduce((s, n) => s + n.stake, 0); }
// Deux tiers de mise sont nécessaires : 3 × poids >= 2 × total évite un arrondi approximatif.
export function hasSupermajority(weight: number, total: number): boolean { return total > 0 && 3 * weight >= 2 * total; }
// Vérifie les ressources, identifiants uniques et bornes avant de démarrer le consensus.
export function validateConfig(c: PosConfig): void {
    const ids = c.validators.map(n => n.id);
    if (typeof c.seed !== 'string' || !c.seed || c.seed.length > 128 || !integer(c.slotDurationMs, 3, 1000000) || !integer(c.slotsPerEpoch, 1, 100)
        || !integer(c.maxSlots, 1, 300) || !integer(c.blockCapacity, 1, 100)
        || c.validators.length < 1 || c.validators.length > 64 || new Set(ids).size !== ids.length
        || c.validators.some(n => !/^[A-Za-z0-9_-]{1,64}$/.test(n.id) || !n.publicKey
            || !integer(n.stake, 0, 1000000000) || n.hashPower !== 0)
        || !integer(totalStake(c.validators), 1, 1000000000)
        || !['park-miller-v1', 'sha256-rejection-v1'].includes(c.selectionVersion)
        || (c.selectionVersion === 'park-miller-v1' && (!/^\d+$/.test(c.seed) || !integer(Number(c.seed), 1, 2147483646)))) {
        throw new Error('CONFIG_INVALID : paramètres PoS hors bornes ou identités dupliquées.');
    }
}
// Tirage par entier uniforme avec rejet : le calendrier ne dépend pas du réseau.
// Calcule le proposant d'un créneau indépendamment des retards et des messages reçus.
export function proposerForSlot(c: PosConfig, slot: number): string {
    const total = BigInt(totalStake(c.validators));
    if (!integer(slot) || total <= 0n)
        throw new Error('CONFIG_INVALID');
    // Le profil pédagogique reprend la suite depuis la seed jusqu'au tirage du créneau demandé.
    if (c.selectionVersion === 'park-miller-v1') {
        const next = createSeededRandom(Number(c.seed));
        let draw = 0;
        for (let i = 0; i <= slot; i++)
            draw = next();
        return selectProposer(c.validators, draw).id;
    }
    const range = 1n << 256n;
    // Le rejet des valeurs hors limite évite de favoriser certains tickets avec le modulo.
    const limit = range - range % total;
    let counter = 0, value: bigint;
    do {
        value = BigInt('0x' + hash(['selection-sha256-rejection-v1', c.seed, slot, counter++]));
    } while (value >= limit);
    let ticket = Number(value % total);
    for (const n of [...c.validators].sort((a, b) => compareId(a.id, b.id))) {
        if (ticket < n.stake)
            return n.id;
        // Passe à l'intervalle du validateur suivant si le ticket n'appartient pas au précédent.
        ticket -= n.stake;
    }
    throw new Error('CONFIG_INVALID');
}
// Remonte les parents connus localement pour savoir si un bloc appartient au passé d'un autre.
export function isAncestor(blocks: ReadonlyMap<string, Block>, ancestor: string, descendant: string): boolean {
    let id: string | null = descendant;
    const seen = new Set<string>();
    while (id !== null && !seen.has(id)) {
        if (id === ancestor)
            return blocks.has(id);
        seen.add(id);
        id = blocks.get(id)?.header.parentId ?? null;
    }
    return false;
}
// Vérifie une référence de checkpoint : elle doit exister localement et précéder sa frontière d'époque.
export function validCheckpoint(c: Checkpoint, blocks: ReadonlyMap<string, Block>, genesisId: string, L: number): boolean {
    if (!c || !integer(c.epoch) || typeof c.blockId !== 'string' || !integer(c.epoch * L))
        return false;
    const b = blocks.get(c.blockId);
    if (!b)
        return false;
    if (c.epoch === 0)
        return c.blockId === genesisId;
    return b.header.height === 0 || (b.header.consensus.kind === 'pos' && b.header.consensus.slot < c.epoch * L);
}
