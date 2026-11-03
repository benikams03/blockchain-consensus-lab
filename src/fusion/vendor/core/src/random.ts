// Version du tirage enregistrée dans les exports : changer de générateur change le calendrier.
export const SELECTION_VERSION = 'park-miller-v1' as const;
// Construit un générateur reproductible. La même seed fournit la même suite de nombres, sans sécurité cryptographique.
export function createSeededRandom(seed: number): () => number {
    // Constante du générateur Park-Miller ; la seed doit être strictement comprise entre 0 et ce nombre.
    const modulus = 2147483647;
    if (!Number.isInteger(seed) || seed < 1 || seed >= modulus)
        throw new Error('SEED_INVALID');
    let state = seed;
    // Avance une fois dans la suite : cet état sert au prochain tirage, pas au solde d'un compte.
    return () => { state = (state * 16807) % modulus; return (state - 1) / (modulus - 1); };
}
// Transforme un tirage en choix de validateur : une mise plus grande occupe une plus grande part des tickets.
export function selectProposer<T extends {
    id: string;
    stake: number;
}>(validators: readonly T[], draw: number): T {
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1)
        throw new Error('DRAW_INVALID');
    // Trie les identités pour que l'ordre des nœuds dans le fichier JSON ne change pas le résultat.
    const ordered = [...validators].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (new Set(ordered.map(n => n.id)).size !== ordered.length)
        throw new Error('IDENTITY_DUPLICATED');
    let total = 0;
    for (const n of ordered) {
        if (!Number.isSafeInteger(n.stake) || n.stake < 0)
            throw new Error('STAKE_INVALID');
        total += n.stake;
    }
    if (!Number.isSafeInteger(total) || total <= 0 || total > 1000000000)
        throw new Error('STAKE_TOTAL_INVALID');
    // Exemple : total 100 et tirage 0,55 donnent le ticket 55, attribué selon les intervalles de mises.
    const ticket = Math.floor(draw * total);
    let cumulative = 0;
    for (const n of ordered) {
        // Chaque validateur reçoit autant de tickets que sa mise ; une mise nulle ne peut pas gagner.
        cumulative += n.stake;
        if (ticket < cumulative)
            return n;
    }
    throw new Error('SELECTION_FAILED');
}
// Empêche la modification accidentelle des objets publics déjà partagés avec les modules.
export function freezeData<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            freezeData(child);
        Object.freeze(value);
    }
    return value;
}
