import { hash, Random, sign, verify } from '../core/primitives.js';
import { ADVANCED_MODEL } from './pow-proof.js';
export type Behavior = 'honest' | 'silent' | 'double';
export interface Wallet { id: string; name: string; available: number; staked: number; withdrawals: { amount: number; unlockEpoch: number }[]; behavior: Behavior }
export interface StakeEvent { index: number; slot: number; type: string; text: string }
export interface EconomicBlock { id: string; parent: string; height: number; producer: string; slot: number; signature: string }
export interface StakeVote { validator: string; source: number; target: number; block: string; weight: number; signature: string }
export class StakingLab {
  readonly modelVersion = ADVANCED_MODEL;
  readonly wallets: Wallet[];
  readonly initialSupply: number;
  readonly events: StakeEvent[] = [];
  readonly proofs: { validator: string; slot: number; first: object; second: object; signatureFirst: string; signatureSecond: string }[] = [];
  readonly blocks: EconomicBlock[] = [];
  readonly checkpoints: { epoch: number; height: number; weight: number; total: number; justified: boolean; votes: StakeVote[] }[] = [];
  slot = 0; epoch = 0; issued = 0; burned = 0; justifiedEpoch = -1; finalizedHeight = 0;
  weights: Record<string, number> = {};
  readonly weightHistory: Record<number, Record<string, number>> = {};
  private evidence = new Set<string>();
  constructor(readonly seed = 42, allocation = [200, 200, 200, 200]) {
    if (!Number.isSafeInteger(seed) || seed < 0 || allocation.length < 2 || allocation.length > 32 || allocation.some(a => !Number.isSafeInteger(a) || a < 0 || a > 1000)) throw new Error('STAKING_CONFIG');
    this.wallets = allocation.map((stake,i) => ({ id: `n${i}`, name: ['Benji','Kam','Alice','Léa'][i] ?? `Participant ${i+1}`, available: 1000-stake, staked: stake, withdrawals: [], behavior: 'honest' }));
    this.initialSupply=this.wallets.length*1000; this.freezeWeights(); this.event('CREATED', `${this.wallets.length} portefeuilles de 1 000 unités ; mises initiales : ${allocation.join(', ')}.`);
  }
  private wallet(id: string) { const w = this.wallets.find(w => w.id === id); if (!w) throw new Error('WALLET_UNKNOWN'); return w; }
  private amount(value: number) { if (!Number.isSafeInteger(value) || value <= 0) throw new Error('AMOUNT_POSITIVE_INTEGER'); }
  private event(type: string, text: string) { this.events.push({ index: this.events.length, slot: this.slot, type, text }); }
  private freezeWeights() { this.weights = Object.fromEntries(this.wallets.map(w => [w.id, w.staked - w.withdrawals.reduce((s, x) => s + x.amount, 0)])); this.weightHistory[this.epoch] = { ...this.weights }; }
  deposit(id: string, amount: number) { this.amount(amount); const w = this.wallet(id); if (w.available < amount) throw new Error('INSUFFICIENT_AVAILABLE'); w.available -= amount; w.staked += amount; this.event('DEPOSIT', `${w.name} immobilise ${amount} unités. Le nouveau poids s’appliquera à la prochaine époque.`); this.assertInvariant(); }
  withdraw(id: string, amount: number) { this.amount(amount); const w = this.wallet(id); if (w.staked - w.withdrawals.reduce((s, x) => s + x.amount, 0) < amount) throw new Error('INSUFFICIENT_STAKED'); w.withdrawals.push({ amount, unlockEpoch: this.epoch + 2 }); this.event('WITHDRAW_REQUEST', `${w.name} réserve un retrait de ${amount}, libérable à l’époque ${this.epoch + 2}. Le poids change à la prochaine époque.`); this.assertInvariant(); }
  behavior(id: string, value: Behavior) { if (!['honest', 'silent', 'double'].includes(value)) throw new Error('BEHAVIOR'); this.wallet(id).behavior = value; this.event('BEHAVIOR', `${this.wallet(id).name} : ${value}.`); }
  private slash(id: string, amount: number, reason: string) {
    const w = this.wallet(id), burned = Math.min(w.staked, amount); w.staked -= burned; this.burned += burned;
    let excess = Math.max(0, w.withdrawals.reduce((s, x) => s + x.amount, 0) - w.staked);
    for (const item of [...w.withdrawals].reverse()) { const cut = Math.min(excess, item.amount); item.amount -= cut; excess -= cut; }
    w.withdrawals = w.withdrawals.filter(x => x.amount > 0);
    this.event('BURN', `${w.name} perd ${burned} unités brûlées : ${reason}.`);
  }
  proposer(): string | null {
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0); if (!total) return null;
    let ticket = new Random((this.seed ^ Math.imul(this.slot + 1, 2654435761)) >>> 0).next() * total;
    for (const w of this.wallets) { ticket -= this.weights[w.id]; if (ticket < 0) return w.id; } return this.wallets.at(-1)!.id;
  }
  step() {
    if (this.slot >= 160) throw new Error('STAKING_RUN_LIMIT');
    const id = this.proposer(), parent = this.blocks.at(-1)?.id ?? hash({ genesis: 'staking-v2' });
    if (id) {
      const w = this.wallet(id), payload = { parent, height: this.blocks.length + 1, producer: id, slot: this.slot }, digest = hash(payload);
      if (w.behavior === 'silent') this.event('MISSED_SLOT', `${w.name}, proposeur choisi avec un poids ${this.weights[id]}, ne propose pas.`);
      else if (w.behavior === 'double') {
        const alternative = { ...payload, parent: hash({ conflict: parent }) }, sigA = sign(id, payload), sigB = sign(id, alternative);
        if (verify(id, payload, sigA) && verify(id, alternative, sigB) && !this.evidence.has(`${id}:${this.slot}`)) { this.evidence.add(`${id}:${this.slot}`); this.proofs.push({ validator: id, slot: this.slot, first: payload, second: alternative, signatureFirst: sigA, signatureSecond: sigB }); this.event('DOUBLE_PROPOSAL_PROOF', `Deux propositions contradictoires signées par ${w.name} au créneau ${this.slot}. Aucune n’est retenue par cet atelier.`); this.slash(id, Math.max(1, Math.ceil(this.weights[id] * .1)), 'double proposition prouvée (politique pédagogique : 10 % du poids de l’époque)'); }
      } else {
        const block = { ...payload, id: digest, signature: sign(id, payload) }; if (!verify(id, payload, block.signature)) throw new Error('BLOCK_SIGNATURE'); this.blocks.push(block);
        w.available += 2; this.issued += 2; this.event('BLOCK_REWARD', `${w.name} propose le bloc #${block.height} ; récompense émise de 2 unités.`);
      }
    } else this.event('NO_STAKE', 'Aucune mise active : aucun proposeur admissible.');
    if ((this.slot + 1) % 4 === 0) this.finishEpoch();
    this.slot++; this.assertInvariant(); return this.snapshot();
  }
  private finishEpoch() {
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0), head = this.blocks.at(-1), source = this.justifiedEpoch;
    const votes: StakeVote[] = [];
    if (head) for (const w of this.wallets) if (w.behavior === 'honest' && this.weights[w.id] > 0) {
      const data = { validator: w.id, source, target: this.epoch, block: head.id, weight: this.weights[w.id] };
      const vote = { ...data, signature: sign(w.id, data) }; if (verify(w.id, data, vote.signature)) votes.push(vote);
    }
    const weight = votes.reduce((s, v) => s + v.weight, 0), justified = !!head && total > 0 && weight * 3 >= total * 2;
    this.checkpoints.push({ epoch: this.epoch, height: head?.height ?? 0, weight, total, justified, votes });
    if (justified) {
      if (source === this.epoch - 1) this.finalizedHeight = this.checkpoints.find(c => c.epoch === source)?.height ?? 0;
      this.justifiedEpoch = this.epoch; this.event('CHECKPOINT', `Époque ${this.epoch} justifiée : ${weight}/${total} unités de vote ; hauteur finalisée ${this.finalizedHeight}.`);
    } else this.event('QUORUM_MISSING', `Époque ${this.epoch} non justifiée : ${weight}/${total} unités de vote, quorum de deux tiers non atteint.`);
    for (const w of this.wallets) if (w.behavior === 'silent' && this.weights[w.id] > 0) this.slash(w.id, 1, 'absence de vote : pénalité pédagogique de 1 unité par époque');
    this.epoch++;
    for (const w of this.wallets) { const due = w.withdrawals.filter(x => x.unlockEpoch <= this.epoch); for (const item of due) { w.staked -= item.amount; w.available += item.amount; this.event('WITHDRAW_RELEASE', `${w.name} récupère ${item.amount} unités disponibles.`); } w.withdrawals = w.withdrawals.filter(x => x.unlockEpoch > this.epoch); }
    this.freezeWeights();
  }
  assertInvariant() {
    if (this.wallets.some(w => w.available < 0 || w.staked < 0 || w.withdrawals.reduce((s, x) => s + x.amount, 0) > w.staked)) throw new Error('STAKING_BALANCE_INVARIANT');
    if (this.wallets.reduce((s, w) => s + w.available + w.staked, 0) !== this.initialSupply + this.issued - this.burned) throw new Error('STAKING_SUPPLY_INVARIANT');
  }
  snapshot() { return structuredClone({ modelVersion: this.modelVersion, kind: 'staking-economic' as const, seed: this.seed, slot: this.slot, epoch: this.epoch, wallets: this.wallets, weights: this.weights, weightHistory: this.weightHistory, blocks: this.blocks, checkpoints: this.checkpoints, proofs: this.proofs, events: this.events, issued: this.issued, burned: this.burned, initialSupply: this.initialSupply, supply: this.initialSupply + this.issued - this.burned, finalizedHeight: this.finalizedHeight, justifiedEpoch: this.justifiedEpoch }); }
}
export type StakeSnapshot = ReturnType<StakingLab['snapshot']>;
