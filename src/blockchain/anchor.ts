import { isFusionModel } from '../fusion/model.js';
import { consensusIndices } from '../core/participants.js';
import { keccak256, toUtf8Bytes } from 'ethers';
import type { Config, Metrics, Snapshot } from '../core/types.js';
export const SEPOLIA_ID = 11155111;
export const REGISTRY_NAME = 'UNIKIN_CONSENSUS_RESULTS_V2';
export const TRACE_PREFIX = 'UNIKIN_CONSENSUS_FUSION_V4\n';
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJson((v as Record<string, unknown>)[k])).join(',') + '}';
  throw new Error('Donnée non JSON dans le rapport.');
}
export function anchorPayload(input: unknown) {
  const v = JSON.parse(JSON.stringify(input)) as { modelVersion: string; config: Config; metrics: Metrics; snapshot: Snapshot; trace: unknown[]; sessionId?: string };
  if (!v || !isFusionModel(v.modelVersion) || !v.snapshot?.done || v.snapshot.termination !== 'duration' || !Array.isArray(v.trace) || !v.trace.length) throw new Error('Terminez une expérience Fusion v4 complète avant l’ancrage.');
  delete v.sessionId;
  if (canonicalJson(v.config) !== canonicalJson(v.snapshot.config) || canonicalJson(v.metrics) !== canonicalJson(v.snapshot.metrics) || v.config.nodeCount !== v.snapshot.nodes.length || v.metrics.time !== v.snapshot.time) throw new Error('Configuration, mesures et état final incohérents.');
  const protocol = ['pow', 'pos', 'pbft'].indexOf(v.config.protocol), nodes = v.snapshot.nodes.length, blocks = v.metrics.blocks + 1, transactions = v.metrics.transactions, secured = v.metrics.settledTransactions, durationMs = v.snapshot.time;
  if (protocol < 0 || ![nodes, blocks, transactions, secured, durationMs].every(Number.isSafeInteger) || nodes < 1 || nodes > 64 || blocks < 1 || blocks > 1000 || transactions < 0 || transactions > 1000 || secured < 0 || secured > transactions || durationMs < 1 || durationMs > 2592000000) throw new Error('Résumé hors des bornes du contrat.');
  return { traceHash: keccak256(toUtf8Bytes(TRACE_PREFIX + canonicalJson(v))), protocol, nodes, blocks, transactions, secured, durationMs, modelVersion: v.modelVersion, participants: consensusIndices(v.config).length, observer: v.metrics.observer };
}
export type Anchor = ReturnType<typeof anchorPayload>;
export const argumentsFor = (p: Anchor) => [p.traceHash, p.protocol, p.nodes, p.blocks, p.transactions, p.secured, p.durationMs] as const;
export interface WalletProvider { isMetaMask?: boolean; providers?: WalletProvider[]; request(args: { method: string; params?: unknown[] }): Promise<any>; on?(event: string, cb: (...args: any[]) => void): void; removeListener?(event: string, cb: (...args: any[]) => void): void }
export async function requireSepolia(p: WalletProvider) {
  const chain = await p.request({ method: 'eth_chainId' });
  if (Number(chain) !== SEPOLIA_ID) { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }); }
  if (Number(await p.request({ method: 'eth_chainId' })) !== SEPOLIA_ID) throw new Error('Seul le réseau de test Sepolia est autorisé.');
}
