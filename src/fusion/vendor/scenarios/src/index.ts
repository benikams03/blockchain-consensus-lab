// Ce fichier décrit les expériences ; les règles de consensus restent dans l'adaptateur PoS.
export { demoAccounts, demoPayment } from './participants.js';
export type { DemoAccount } from './participants.js';
import type { DemoAccount } from './participants.js';
export interface DemoScenario {
    faultStartMs?: number;
    silentNodes?: string[];
    invalidSigners?: string[];
    id: string; // Nom de l'expérience, également utilisé pour son export JSON.
    stakes: number[]; // Une mise par nœud, dans le même ordre que nodeIds.
    seed: string; // Point de départ du hasard reproductible ; ce n'est pas une clé privée.
    maxSlots: number; // Nombre de créneaux disponibles, pas nombre garanti de blocs produits.
    slotsPerEpoch: number; // Nombre de créneaux regroupés pour les votes de finalité.
    minLatencyMs: number; // Retard minimal d'un message entre deux nœuds virtuels.
    maxLatencyMs: number; // Retard maximal ; les délais sont tirés dans cet intervalle.
    offline: string[]; // Nœuds arrêtés pendant toute l'expérience.
    equivocators: string[]; // Nœuds qui signent volontairement des votes contradictoires.
    partitions: {
        startMs: number;
        endMs: number;
        groups: string[][];
    }[]; // Groupes temporairement isolés.
    nodeIds?: string[]; // Identifiants des machines, distincts des comptes de paiement.
    selectionVersion?: 'park-miller-v1' | 'sha256-rejection-v1';
    withholdVotes?: string[]; // Nœuds qui produisent encore mais ne transmettent plus leurs votes.
    doubleProposers?: string[]; // Nœuds qui proposent deux blocs différents au même créneau.
    surroundVoters?: string[]; // Nœuds qui créent deux liens de vote dont l'un entoure l'autre.
    observerNodeId?: string; // Nœud dont la vue sert aux mesures ; il n'est pas le chef du réseau.
    entryNodeId?: string; // Machine qui reçoit le paiement en premier, avant sa propagation.
    transactionPlan?: {
        from: string;
        to: string;
        amount: number;
        nonce: number;
        atMs: number;
        entryNodeId: string;
    }[];
    slotDurationMs?: number; // Durée virtuelle d'un créneau ; aucune attente réelle n'est imposée.
    blockCapacity?: number; // Nombre maximal de paiements admis dans un bloc.
    accounts?: DemoAccount[]; // Utilisateurs de paiement, distincts des machines.
    stopAfterBlocks?: number; // Objectif de hauteur chez l'observateur ; l'hôte arrête après diffusion du dernier tour.
}
// Profils historiques conservés pour les tests de régression à quatre validateurs.
export const honest: DemoScenario = {
    id: 'honest-v1', stakes: [40, 30, 20, 10], seed: 'unikin-pos-v1', maxSlots: 16, slotsPerEpoch: 4,
    minLatencyMs: 10, maxLatencyMs: 50, offline: [], equivocators: [], partitions: [],
};
export const offline: DemoScenario = { ...honest, id: 'offline-40-v1', offline: ['A'] };
export const equivocation: DemoScenario = { ...honest, id: 'equivocation-v1', equivocators: ['A'] };
export const partition: DemoScenario = { ...honest, id: 'partition-recovery-v1', maxSlots: 24,
    partitions: [{ startMs: 3000, endMs: 9000, groups: [['A', 'B'], ['C', 'D']] }] };
// Petit réseau facultatif pour comprendre facilement les calculs 50 + 30 + 20 = 100.
export const tutorial: DemoScenario = { ...honest, id: 'pos-simple-3-noeuds-v2-1',
    nodeIds: ['noeud-01', 'noeud-02', 'noeud-03'], stakes: [50, 30, 20], seed: '12345',
    selectionVersion: 'park-miller-v1', observerNodeId: 'noeud-02', entryNodeId: 'noeud-01' };
export const tutorialOffline: DemoScenario = { ...tutorial, id: 'pos-simple-50-hors-ligne-v2-1', offline: ['noeud-01'], entryNodeId: 'noeud-02' };
export const tutorialMinorityOffline: DemoScenario = { ...tutorial, id: 'pos-simple-30-hors-ligne-v2-1', offline: ['noeud-02'], observerNodeId: 'noeud-01' };
export const tutorialRetention: DemoScenario = { ...tutorial, id: 'pos-simple-retention-v2-1', withholdVotes: ['noeud-01'], entryNodeId: 'noeud-02' };
export const tutorialEquivocation: DemoScenario = { ...tutorial, id: 'pos-simple-doubles-votes-v2-1', equivocators: ['noeud-03'] };
export const tutorialDoubleProposal: DemoScenario = { ...tutorial, id: 'pos-simple-doubles-propositions-v2-1', doubleProposers: ['noeud-03'] };
export const tutorialSurround: DemoScenario = { ...tutorial, id: 'pos-simple-votes-entourants-v2-1', surroundVoters: ['noeud-03'] };
export const tutorialPartition: DemoScenario = { ...tutorial, id: 'pos-simple-partition-v2-1', maxSlots: 24,
    partitions: [{ startMs: 3000, endMs: 9000, groups: [['noeud-01'], ['noeud-02', 'noeud-03']] }] };
export const tutorialLatency: DemoScenario = { ...tutorial, id: 'pos-simple-latence-v2-1', maxSlots: 24, minLatencyMs: 400, maxLatencyMs: 900 };
export const tutorialConflicts: DemoScenario = { ...tutorial, id: 'pos-simple-conflits-v2-1', minLatencyMs: 300, maxLatencyMs: 800,
    transactionPlan: [
        { from: 'david', to: 'sarah', amount: 10, nonce: 0, atMs: 0, entryNodeId: 'noeud-01' },
        { from: 'david', to: 'lea', amount: 10, nonce: 0, atMs: 0, entryNodeId: 'noeud-03' },
    ] };
// Douze machines : les mises sont inégales et leur somme reste exactement 100.
// Les identifiants 01, 02... permettent de trier noeud-10 après noeud-09.
export const defaultScenario: DemoScenario = { ...tutorial, id: 'pos-honnete-12-noeuds-v2-1',
    nodeIds: Array.from({ length: 12 }, (_, i) => `noeud-${String(i + 1).padStart(2, '0')}`),
    stakes: [20, 15, 12, 10, 8, 7, 6, 6, 5, 4, 4, 3], maxSlots: 24,
    observerNodeId: 'noeud-04', entryNodeId: 'noeud-01' };
// Les dix expériences du bilan gardent les mêmes douze machines, mises et durée.
export const scenarios = {
    honest: defaultScenario,
    // 35 % absents : les 65 % disponibles ne suffisent pas au quorum de deux tiers.
    offline: { ...defaultScenario, id: 'pos-35-hors-ligne-12-noeuds-v2-1', offline: ['noeud-01', 'noeud-02'], entryNodeId: 'noeud-03' },
    // 20 % absents : les 80 % restants peuvent encore atteindre le quorum.
    minority: { ...defaultScenario, id: 'pos-20-hors-ligne-12-noeuds-v2-1', offline: ['noeud-01'], entryNodeId: 'noeud-03' },
    retention: { ...defaultScenario, id: 'pos-retention-12-noeuds-v2-1', withholdVotes: ['noeud-01', 'noeud-02'], entryNodeId: 'noeud-03' },
    // Le nœud 12 obtient un créneau dans ce calendrier : la double proposition sera réellement observable.
    equivocation: { ...defaultScenario, id: 'pos-doubles-votes-12-noeuds-v2-1', equivocators: ['noeud-12'] },
    proposals: { ...defaultScenario, id: 'pos-doubles-propositions-12-noeuds-v2-1', doubleProposers: ['noeud-12'] },
    surround: { ...defaultScenario, id: 'pos-votes-entourants-12-noeuds-v2-1', surroundVoters: ['noeud-12'] },
    partition: { ...defaultScenario, id: 'pos-partition-12-noeuds-v2-1',
        partitions: [{ startMs: 3000, endMs: 9000, groups: [defaultScenario.nodeIds!.slice(0, 2), defaultScenario.nodeIds!.slice(2)] }] },
    latency: { ...defaultScenario, id: 'pos-latence-12-noeuds-v2-1', minLatencyMs: 400, maxLatencyMs: 900 },
    conflicts: { ...defaultScenario, id: 'pos-conflits-12-noeuds-v2-1', minLatencyMs: 300, maxLatencyMs: 800,
        transactionPlan: [
            { from: 'david', to: 'sarah', amount: 10, nonce: 0, atMs: 0, entryNodeId: 'noeud-01' },
            { from: 'david', to: 'lea', amount: 10, nonce: 0, atMs: 0, entryNodeId: 'noeud-12' },
        ] },
} satisfies Record<string, DemoScenario>;
// Le profil à trois nœuds reste disponible sans entrer dans le bilan comparatif à douze nœuds.
// Parcours plus riche : les trois utilisateurs émettent huit paiements successifs, à des instants différents.
export const completeScenario: DemoScenario = { ...defaultScenario, id: 'pos-parcours-complet-v2-2', transactionPlan: [
    { from: 'david', to: 'sarah', amount: 10, nonce: 0, atMs: 0, entryNodeId: 'noeud-01' },
    { from: 'david', to: 'lea', amount: 25, nonce: 1, atMs: 1200, entryNodeId: 'noeud-05' },
    { from: 'sarah', to: 'lea', amount: 3, nonce: 0, atMs: 3200, entryNodeId: 'noeud-08' },
    { from: 'lea', to: 'david', amount: 5, nonce: 0, atMs: 5200, entryNodeId: 'noeud-03' },
    { from: 'david', to: 'sarah', amount: 15, nonce: 2, atMs: 8200, entryNodeId: 'noeud-04' },
    { from: 'sarah', to: 'david', amount: 2, nonce: 1, atMs: 11200, entryNodeId: 'noeud-07' },
    { from: 'david', to: 'lea', amount: 7, nonce: 3, atMs: 15200, entryNodeId: 'noeud-10' },
    { from: 'lea', to: 'sarah', amount: 4, nonce: 1, atMs: 18200, entryNodeId: 'noeud-06' },
] };
export const runnableScenarios = { ...scenarios, simple: tutorial, complete: completeScenario };
export type ScenarioName = keyof typeof runnableScenarios;
