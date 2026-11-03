import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import type { Block, BlockHeader, PosConfig, PosPayload, SignedMessage, Transaction } from '../../contracts/src/index.js';
import { isPosMessage } from '../../contracts/src/schema.js';

// Portable demonstration identities. Deliberately public/reproducible; NEVER wallet keys.
// MetaMask keys remain inside the wallet and are unrelated to this simulator.
const identities = new Map<string, { privateKey: Uint8Array; publicKey: string }>();
const verified = new Set<string>();
const base64 = (a: Uint8Array) => btoa(String.fromCharCode(...a));
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export function hash(value: readonly unknown[]): string { return bytesToHex(sha256(utf8ToBytes(JSON.stringify(value)))); }
export function headerValues(h: BlockHeader): unknown[] {
  const c = h.consensus;
  return ['block', h.protocolVersion, h.protocol, h.parentId, h.height, h.producerId, h.proposedAtMs, h.txIds,
    c.kind === 'pos' ? ['pos', c.slot] : c.kind === 'pow' ? ['pow', c.workUnits, c.discoveryId] : ['pbft', c.proposedInView, c.sequence]];
}
export function blockId(h: BlockHeader) { return hash(headerValues(h)); }
export function txId(t: Pick<Transaction, 'from' | 'to' | 'amount' | 'nonce'>) { return hash(['tx', 1, t.from, t.to, t.amount, t.nonce]); }
export function payloadValues(p: PosPayload): unknown[] {
  switch (p.kind) {
    case 'transaction': return [p.kind, p.transaction.id];
    case 'proposal': case 'blockResponse': return [p.kind, p.block.id];
    case 'requestBlock': return [p.kind, p.blockId];
    case 'headVote': return [p.kind, p.slot, p.blockId];
    case 'linkVote': return [p.kind, p.source.epoch, p.source.blockId, p.target.epoch, p.target.blockId];
  }
}
export function messageId(m: Pick<SignedMessage, 'domain' | 'signerId' | 'payload'>) { return hash(['pos-message', 1, 'pos', m.domain, m.signerId, payloadValues(m.payload)]); }
export function compareId(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
export function makeDomain(genesis: string, c: PosConfig, stateRoot: string) {
  return hash(['fusion-pos-domain-v4', genesis, stateRoot, c.seed, c.slotDurationMs, c.slotsPerEpoch, c.maxSlots, c.blockCapacity, c.selectionVersion,
    [...c.validators].sort((a, b) => compareId(a.id, b.id)).map(n => [n.id, n.publicKey, n.hashPower, n.stake])]);
}
export function signId(id: string, key: Uint8Array) { return base64(ed25519.sign(utf8ToBytes(id), key)); }
export function verifyId(id: string, signature: string, key: string) {
  try {
    if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id) || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature) || typeof key !== 'string') return false;
    const cache = JSON.stringify([id, signature, key]); if (verified.has(cache)) return true;
    const ok = ed25519.verify(bytes(signature), utf8ToBytes(id), bytes(key));
    if (ok) { if (verified.size >= 10000) verified.clear(); verified.add(cache); } return ok;
  } catch { return false; }
}
export function signMessage<P extends PosPayload>(domain: string, signerId: string, payload: P, key: Uint8Array): SignedMessage<P> {
  const id = messageId({ domain, signerId, payload }); return { protocolVersion: 1, protocol: 'pos', domain, signerId, payload, id, signature: signId(id, key) };
}
export function verifyMessage(m: SignedMessage, config: PosConfig, domain: string) {
  try { if (!isPosMessage(m) || m.domain !== domain) return false; const n = config.validators.find(n => n.id === m.signerId); return !!n && m.id === messageId(m) && verifyId(m.id, m.signature, n.publicKey); } catch { return false; }
}
export function makeBlock(header: BlockHeader, transactions: Transaction[], key: Uint8Array): Block { const id = blockId(header); return { id, header, transactions, producerSignature: signId(id, key) }; }
export function loadOrCreateIdentity(label: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(label)) throw new Error('IDENTITY_INVALID');
  if (!identities.has(label)) { const privateKey = sha256(utf8ToBytes('PUBLIC-DEMO-ONLY-consensus-fusion-v4:' + label)); identities.set(label, { privateKey, publicKey: base64(ed25519.getPublicKey(privateKey)) }); }
  return identities.get(label)!;
}
export const demoIdentity = loadOrCreateIdentity;
