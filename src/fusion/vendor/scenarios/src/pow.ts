// Les comptes et paiements restent communs ; seules les ressources et règles de consensus changent.
import { scenarioFromSettings } from './settings.js';
import type { SimulationSettings } from './settings.js';
import type { PowScenario } from '../../contracts/src/pow.js';
export interface PowSettings extends Omit<SimulationSettings, 'mises' | 'toursParEpoque'> {
    puissances?: number[]; tempsBlocMoyenMs?: number; confirmations?: number;
}
export const defaultPowSettings: PowSettings = { blocs: 30, noeuds: 12, utilisateurs: 8, transactions: 40, seed: '12345',
    latenceMinMs: 10, latenceMaxMs: 50, dureeTourMs: 1000, capaciteBloc: 10, tempsBlocMoyenMs: 1000, confirmations: 6 };
export function powScenarioFromSettings(input: Partial<PowSettings>): PowScenario {
    const allowed = new Set(Object.keys(defaultPowSettings).concat(['puissances', 'horsLigne']));
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.has(key))) throw new Error('PARAMETRES_POW_INVALIDES');
    const s = { ...defaultPowSettings, ...input }, mean = s.tempsBlocMoyenMs!, k = s.confirmations!;
    if (!Number.isSafeInteger(mean) || mean < 100 || mean > 1000000 || !Number.isSafeInteger(k) || k < 1 || k > 100) throw new Error('PARAMETRES_POW_INVALIDES : délai moyen ou confirmations.');
    const { puissances, tempsBlocMoyenMs, confirmations, ...common } = s;
    const base = scenarioFromSettings({ ...common, mises: puissances });
    return { id: 'pow-configurable-v3', seed: s.seed, powers: base.stakes, nodeIds: base.nodeIds!, meanBlockTimeMs: mean,
        confirmations: k, maxDurationMs: Math.max(10000, s.blocs * mean * 8), blockCapacity: base.blockCapacity!,
        minLatencyMs: s.latenceMinMs, maxLatencyMs: s.latenceMaxMs, offline: base.offline, partitions: [],
        accounts: base.accounts!, transactionPlan: base.transactionPlan!.map(tx => ({ ...tx,
            // Les paiements sont émis tôt ; la fin de production aléatoire ne promet pas de tous les inclure.
            atMs: Math.floor(tx.atMs / s.dureeTourMs * mean * 0.55) })),
        observerNodeId: base.observerNodeId!, entryNodeId: base.entryNodeId!, stopAfterBlocks: s.blocs };
}
const base = powScenarioFromSettings({ blocs: 24, noeuds: 12, utilisateurs: 3, transactions: 1 });
const ordinary = [{ from: 'david', to: 'sarah', amount: 10, nonce: 0, atMs: 0, entryNodeId: 'noeud-02' }];
export const powPresets: Record<string, PowScenario> = {
    honest: { ...base, id: 'pow-honnete-v3', transactionPlan: ordinary },
    offline: { ...base, id: 'pow-hors-ligne-v3', offline: ['noeud-01', 'noeud-02'], observerNodeId: 'noeud-03', transactionPlan: [{ ...ordinary[0], entryNodeId: 'noeud-03' }] },
    latency: { ...base, id: 'pow-fourches-latence-v3', minLatencyMs: 700, maxLatencyMs: 1600, transactionPlan: ordinary },
    partition: { ...base, id: 'pow-partition-v3', partitions: [{ startMs: 1000, endMs: 12000, groups: [base.nodeIds.slice(0, 6), base.nodeIds.slice(6)] }], transactionPlan: ordinary },
    private: { ...base, id: 'pow-branche-privee-v3', seed: '1', powers: [60, ...Array(10).fill(3), 10], observerNodeId: 'noeud-02', privateAttack: { minerId: 'noeud-01', releaseAtMs: 12000 }, transactionPlan: ordinary },
    doubleSpend: { ...base, id: 'pow-double-depense-v3', seed: '1', powers: [60, ...Array(10).fill(3), 10], observerNodeId: 'noeud-02',
        privateAttack: { minerId: 'noeud-01', releaseAtMs: 15000, excludedTransactionIndex: 0 },
        transactionPlan: [...ordinary, { from: 'david', to: 'lea', amount: 10, nonce: 0, atMs: 0, entryNodeId: 'noeud-01' }],
        merchant: { nodeId: 'noeud-02', transactionIndex: 0, conflictingIndex: 1, confirmations: 2 } },
};
