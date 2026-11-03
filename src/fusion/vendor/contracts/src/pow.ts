// Contrats PoW : aucune mise, aucun vote et aucune finalité déterministe.
import type { Block, Ledger, NodeConfig, Transaction, PaymentAccount, PlannedPayment, NetworkPartition } from './index.js';
export interface PowConfig {
    seed: string;
    meanBlockTimeMs: number; // Moyenne du réseau complet, pas délai garanti entre deux blocs.
    confirmations: number; // Seuil d'observation k ; un paiement confirmé peut encore être réorganisé.
    blockCapacity: number;
    maxDurationMs: number;
    validators: NodeConfig[]; // stake = 0 ; hashPower décrit la ressource de chaque mineur.
    discoveryVersion: 'pow-exponential-sha256-v1';
}
export interface PowScenario {
    id: string; seed: string; powers: number[]; nodeIds: string[];
    meanBlockTimeMs: number; confirmations: number; maxDurationMs: number; blockCapacity: number;
    minLatencyMs: number; maxLatencyMs: number; offline: string[];
    partitions: NetworkPartition[]; transactionPlan: PlannedPayment[];
    accounts: PaymentAccount[]; observerNodeId: string; entryNodeId: string; stopAfterBlocks?: number;
    privateAttack?: { minerId: string; startAtMs?: number; releaseAtMs: number; excludedTransactionIndex?: number };
    merchant?: { nodeId: string; transactionIndex: number; conflictingIndex: number; confirmations: number };
}
export type PowPayload = { kind: 'transaction'; transaction: Transaction } | { kind: 'proposal' | 'blockResponse'; block: Block } | { kind: 'requestBlock'; blockId: string };
export interface PowMessage {
    protocolVersion: 1; protocol: 'pow'; domain: string; signerId: string;
    payload: PowPayload; id: string; signature: string;
}
export interface PowState {
    knownTransactions: Set<string>; pending: Map<string, { message: PowMessage; from: string }>;
    requests: Map<string, number>; privateHeadId: string; privateBlocks: string[]; released: boolean;
}
export interface PowView {
    nodeId: string; nowMs: number; config: PowConfig; domain: string; genesisId: string;
    blocks: ReadonlyMap<string, Block>; headId: string; mempool: readonly Transaction[];
    strategy: { privateMining: boolean; startAtMs?: number; releaseAtMs?: number };
}
export interface PowContext {
    sign(payload: PowPayload): PowMessage; verify(message: PowMessage): boolean;
    verifyTransaction(transaction: Transaction): boolean;
    verifyBlock(block: Block, known: ReadonlyMap<string, Block>, nowMs: number): boolean;
    discovery(timerId: string): Block | undefined;
}
export type PowInput = { kind: 'message'; from: string; message: PowMessage }
    | { kind: 'timer'; timerId: string; generation: number } | { kind: 'transactionAvailable'; transaction: Transaction };
export type PowEffect = { kind: 'send'; to: string; message: PowMessage } | { kind: 'armTimer'; timerId: string; atMs: number; generation: number }
    | { kind: 'acceptBlock'; block: Block } | { kind: 'rejectBlock'; blockId: string; reason: string }
    | { kind: 'acceptTransaction'; transaction: Transaction } | { kind: 'setHead'; blockId: string }
    | { kind: 'release'; blockIds: string[] };
export interface PowNode { id: string; blocks: Map<string, Block>; headId: string; ledger: Ledger; transactions: Map<string, Transaction>; state: PowState }
