import { hash, Random } from '../core/primitives.js';
import { transaction } from '../core/ledger.js';
export const ADVANCED_MODEL = 'atelier-2.0.0';
export interface ProofHeader { version: 2; parent: string; merkleRoot: string; miner: string; seed: number; nonce: number }
export interface WorkProof { modelVersion: string; header: ProofHeader; difficulty: number; target: string; hash: string; transactionIds: string[] }
export function targetFor(difficulty: number) {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) throw new Error('DIFFICULTY_RANGE');
  return '0'.repeat(difficulty) + 'f'.repeat(64 - difficulty);
}
export function merkleRoot(ids: string[]): string {
  if (!ids.length) return hash([]);
  let level = [...ids];
  while (level.length > 1) { if (level.length % 2) level.push(level.at(-1)!); const next: string[] = []; for (let i = 0; i < level.length; i += 2) next.push(hash([level[i], level[i + 1]])); level = next; }
  return level[0];
}
export function merkleWitness(ids: string[], index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= ids.length || ids.some(id => !/^[0-9a-f]{64}$/.test(id))) throw new Error('MERKLE_INPUT');
  const siblings: { side: 'left' | 'right'; hash: string }[] = []; let cursor = index, level = [...ids];
  while (level.length > 1) { if (level.length % 2) level.push(level.at(-1)!); siblings.push({ side: cursor % 2 ? 'left' : 'right', hash: level[cursor ^ 1] }); const next: string[] = []; for (let i=0;i<level.length;i+=2) next.push(hash([level[i],level[i+1]])); level=next; cursor=Math.floor(cursor/2); }
  return { transactionId: ids[index], index, siblings, root: level[0] };
}
export function verifyMerkleWitness(w: ReturnType<typeof merkleWitness>, expectedRoot: string) {
  try { if (!Number.isSafeInteger(w.index) || w.index < 0 || !/^[0-9a-f]{64}$/.test(w.transactionId) || w.siblings.length > 32) return false;
    let digest=w.transactionId, cursor=w.index;
    for (const s of w.siblings) { if (!/^[0-9a-f]{64}$/.test(s.hash) || s.side !== (cursor%2 ? 'left' : 'right')) return false; digest=s.side === 'left' ? hash([s.hash,digest]) : hash([digest,s.hash]); cursor=Math.floor(cursor/2); }
    return cursor === 0 && digest === expectedRoot && w.root === expectedRoot;
  } catch { return false; }
}
export function verifyProof(proof: WorkProof, expectedDifficulty: number): boolean {
  try { return proof.modelVersion === ADVANCED_MODEL && proof.difficulty === expectedDifficulty && proof.target === targetFor(expectedDifficulty) && proof.header.version === 2 && Number.isSafeInteger(proof.header.nonce) && proof.header.nonce >= 0 && proof.header.merkleRoot === merkleRoot(proof.transactionIds) && proof.hash === hash(proof.header) && proof.hash <= proof.target; } catch { return false; }
}
export class MiningRace {
  readonly target: string;
  readonly ids = [transaction('alice', 'benji', 5, 0).id, transaction('kam', 'lea', 7, 0).id];
  readonly counts: number[];
  readonly samples: { miner: string; nonce: number; hash: string }[] = [];
  winner: WorkProof | null = null;
  attempts = 0;
  private random: Random;
  constructor(readonly seed = 42, readonly difficulty = 3, readonly powers = [25, 25, 25, 25]) {
    this.target = targetFor(difficulty);
    if (!Number.isSafeInteger(seed) || seed < 0 || powers.length < 2 || powers.length > 32 || powers.some(p => !Number.isFinite(p) || p < 0) || Math.abs(powers.reduce((a, b) => a + b, 0) - 100) > .001) throw new Error('MINING_CONFIG');
    this.counts = powers.map(() => 0); this.random = new Random(seed);
  }
  batch(limit = 1000) {
    for (let i = 0; i < limit && !this.winner && this.attempts < 2_000_000; i++) {
      let ticket = this.random.next() * this.powers.reduce((a,b)=>a+b,0), miner = this.powers.length - 1;
      for (let j = 0; j < this.powers.length; j++) { ticket -= this.powers[j]; if (ticket < 0) { miner = j; break; } }
      const header: ProofHeader = { version: 2, parent: hash({ genesis: 2 }), merkleRoot: merkleRoot(this.ids), miner: `n${miner}`, seed: this.seed, nonce: this.counts[miner]++ };
      const digest = hash(header); this.attempts++;
      this.samples.push({ miner: header.miner, nonce: header.nonce, hash: digest }); if (this.samples.length > 6) this.samples.shift();
      if (digest <= this.target) this.winner = { modelVersion: ADVANCED_MODEL, header, difficulty: this.difficulty, target: this.target, hash: digest, transactionIds: [...this.ids] };
    }
    return { attempts: this.attempts, counts: [...this.counts], samples: [...this.samples], winner: this.winner, exhausted: this.attempts >= 2_000_000 && !this.winner };
  }
}
