import type { Ledger, Message } from '../../src/core/types.js';
export type Fault = 'honest' | 'silent' | 'equivocate' | 'withhold' | 'invalid';
export interface DistributedConfig { nodes: 4 | 7; latencyMin: number; latencyMax: number; duration: number; seed: number; fault: Fault; faultyNodes: number }
export interface ReplicaSnapshot { id: string; pid: number; port: number; height: number; head: string; view: number; ledger: Ledger; certificates: { height: number; block: string; votes: number }[]; received: number; rejected: number; duplicates: number; restored: boolean }
export type ChildOutput = { type: 'ready' | 'snapshot'; snapshot: ReplicaSnapshot } | { type: 'message'; message: Message } | { type: 'event'; node: string; event: string; data: Record<string, unknown> } | { type: 'error'; message: string };
export interface ProcessConfig { id: string; ids: string[]; fault: Fault; stateFile: string; originTime: number; domain: string; latencyMax: number; secret: string }
