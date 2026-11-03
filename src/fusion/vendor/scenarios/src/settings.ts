// Paramètres simples communs au fichier JSON, à l'assistant terminal et à l'interface.
import { createSeededRandom } from '../../core/src/random.js';
import { defaultScenario } from './index.js';
import type { DemoScenario, DemoAccount } from './index.js';
export interface SimulationSettings {
    blocs: number;
    noeuds: number;
    utilisateurs: number;
    transactions: number;
    seed: string;
    latenceMinMs: number;
    latenceMaxMs: number;
    dureeTourMs: number;
    toursParEpoque: number;
    capaciteBloc: number;
    mises?: number[];
    horsLigne?: string[];
}
export const defaultSettings: SimulationSettings = {
    blocs: 30, noeuds: 12, utilisateurs: 8, transactions: 40, seed: '12345',
    latenceMinMs: 10, latenceMaxMs: 50, dureeTourMs: 1000, toursParEpoque: 4, capaciteBloc: 10,
};
export function scenarioFromSettings(input: Partial<SimulationSettings>): DemoScenario {
    const allowed = new Set(Object.keys(defaultSettings).concat(['mises', 'horsLigne']));
    if (!input || Object.keys(input).some(key => !allowed.has(key))) throw new Error('PARAMETRES_INVALIDES : champ inconnu.');
    const s = { ...defaultSettings, ...input };
    const integer = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
    if (!integer(s.blocs, 1, 100) || !integer(s.noeuds, 1, 64) || !integer(s.utilisateurs, 2, 100)
        || !integer(s.transactions, 0, 1000) || !integer(s.dureeTourMs, 3, 1000000) || !integer(s.toursParEpoque, 1, 100)
        || !integer(s.capaciteBloc, 1, 100) || !integer(s.latenceMinMs, 0, 100000) || !integer(s.latenceMaxMs, s.latenceMinMs, 100000)
        || typeof s.seed !== 'string' || !/^\d+$/.test(s.seed) || !integer(Number(s.seed), 1, 2147483646)) throw new Error('PARAMETRES_INVALIDES : nombres hors limites.');
    const nodeIds = Array.from({ length: s.noeuds }, (_, i) => `noeud-${String(i + 1).padStart(2, '0')}`);
    let stakes = s.mises;
    if (!stakes) {
        if (s.noeuds === 12) stakes = [20, 15, 12, 10, 8, 7, 6, 6, 5, 4, 4, 3];
        else {
            // Une unité par machine, puis répartition pondérée du reste : toujours 100 points au total.
            const denominator = s.noeuds * (s.noeuds + 1) / 2;
            stakes = nodeIds.map((_, i) => 1 + Math.floor((100 - s.noeuds) * (s.noeuds - i) / denominator));
            for (let i = 0, missing = 100 - stakes.reduce((a, b) => a + b, 0); i < missing; i++) stakes[i % stakes.length]++;
        }
    }
    if (stakes.length !== s.noeuds || stakes.some(value => !integer(value, 0, 1000000000)) || stakes.reduce((a, b) => a + b, 0) <= 0) throw new Error('PARAMETRES_INVALIDES : une mise entière par nœud est nécessaire.');
    if (s.horsLigne !== undefined && (!Array.isArray(s.horsLigne) || s.horsLigne.some(id => !nodeIds.includes(id)))) throw new Error('PARAMETRES_INVALIDES : nœud hors ligne inconnu.');
    const accounts: DemoAccount[] = Array.from({ length: s.utilisateurs }, (_, i) => ({
        id: ['david', 'sarah', 'lea'][i] ?? `utilisateur-${String(i + 1).padStart(2, '0')}`,
        name: ['David', 'Sarah', 'Léa'][i] ?? `Utilisateur ${i + 1}`, initialBalance: 1000,
    }));
    // Ce hasard de préparation ne consomme pas les tirages du proposant ou du réseau.
    const random = createSeededRandom((Number(s.seed) + 104729) % 2147483646 + 1);
    const balances = accounts.map(account => account.initialBalance), nonces = accounts.map(() => 0);
    const transactionPlan = Array.from({ length: s.transactions }, (_, i) => {
        const funded = balances.map((balance, index) => balance > 0 ? index : -1).filter(index => index >= 0);
        const from = funded[Math.floor(random() * funded.length)];
        let to = Math.floor(random() * (accounts.length - 1)); if (to >= from) to++;
        const amount = Math.min(balances[from], 1 + Math.floor(random() * 20));
        balances[from] -= amount; balances[to] += amount;
        return { from: accounts[from].id, to: accounts[to].id, amount, nonce: nonces[from]++,
            atMs: Math.floor(Math.max(0, s.blocs - 2) * s.dureeTourMs * i / Math.max(1, s.transactions - 1)),
            entryNodeId: nodeIds[Math.floor(random() * nodeIds.length)] };
    });
    return { ...defaultScenario, id: 'pos-configurable-v2-2', nodeIds, stakes: [...stakes], accounts, transactionPlan,
        seed: s.seed, slotDurationMs: s.dureeTourMs, slotsPerEpoch: s.toursParEpoque, blockCapacity: s.capaciteBloc,
        maxSlots: Math.min(200, Math.max(s.blocs + 4, s.blocs * 3)), stopAfterBlocks: s.blocs,
        minLatencyMs: s.latenceMinMs, maxLatencyMs: s.latenceMaxMs, offline: s.horsLigne ?? [],
        observerNodeId: nodeIds.find(id => !(s.horsLigne ?? []).includes(id)) ?? nodeIds[0], entryNodeId: nodeIds[0] };
}
