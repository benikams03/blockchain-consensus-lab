import { configuration } from '../core/config.js';
import { consensusIndices, controlledIndices, resourceWeights } from '../core/participants.js';
import { FUSION_MODEL } from './model.js';
export { FUSION_MODEL } from './model.js';
import { Simulation as Reference } from '../core/engine.js';
import { accountIds, ancestors } from '../core/ledger.js';
import { hash } from '../core/primitives.js';
import type { Block, Config, Ledger, Metrics, Observation, Snapshot, Transaction } from '../core/types.js';
import { PosHarness } from './vendor/runner/src/engine.js';
import { PowSimulation } from './vendor/runner/src/powEngine.js';
import { defaultScenario } from './vendor/scenarios/src/index.js';
import type { DemoScenario } from './vendor/scenarios/src/index.js';
import type { PowScenario } from './vendor/contracts/src/pow.js';
import type { Block as VendorBlock, Transaction as VendorTransaction } from './vendor/contracts/src/index.js';
import { linkIsLocallyVerifiable } from './vendor/consensus/pos/src/adapter.js';


const percentile = (a: number[], p: number) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.max(0, Math.ceil(a.length * p) - 1)]; };
const tx = (t: VendorTransaction): Transaction => ({ id: t.id, from: t.from, to: t.to, amount: t.amount, nonce: t.nonce, signature: t.signature });
const block = (b: VendorBlock): Block => ({ id: b.id, parent: b.header.parentId, height: b.header.height, producer: b.header.producerId, time: b.header.proposedAtMs,
  txs: b.transactions.map(tx), protocol: b.header.protocol, slot: b.header.consensus.kind === 'pos' ? b.header.consensus.slot : 0,
  work: b.header.height, signature: b.producerSignature });
const ledger = (a: ReadonlyMap<string, { balance: number; nextNonce: number }>): Ledger => Object.fromEntries([...a].map(([id, w]) => [id, { balance: w.balance, nonce: w.nextNonce }]));
export const participants = resourceWeights;

/** Same façade for browser, Worker and Node. Each vendor adapter still receives only a local view. */
export class Simulation {
  readonly config: Config;
  readonly observer: string;
  readonly raw: PosHarness | PowSimulation | Reference;
  readonly trace: Observation[] = [];
  readonly blocks = new Map<string, Block>();
  readonly transactions = new Map<string, Transaction>();
  readonly submitted = new Map<string, number>();
  private included = new Map<string, number>();
  private settled = new Map<string, number>();
  private receptions = new Map<string, Record<string, number>>();
  private certificateReceivers = new Map<string, Set<string>>();
  private eventIndex = 0;
  private steps = 0;
  done = false;
  termination: Snapshot['termination'] = null;
  readonly accounts: { id: string; name: string; initialBalance: number }[];
  constructor(input: Partial<Config> = {}) {
    const c = this.config = configuration(input), ids = Array.from({ length: c.nodeCount }, (_, i) => 'n' + i), resources = participants(c);
    const faulty = controlledIndices(c);
    this.observer = ids.find((_, i) => !faulty.includes(i) && !c.offlineNodes.includes(i)) ?? ids.find((_, i) => !c.offlineNodes.includes(i)) ?? ids[0];
    this.accounts = accountIds(c.accountCount).map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), initialBalance: 1000 }));
    if (c.protocol === 'pbft') this.raw = new Reference(c);
    else {
      const plan: { from: string; to: string; amount: number; nonce: number; atMs: number; entryNodeId: string }[] = [], nonces: Record<string, number> = {};
      const ordinary = c.attack === 'double' ? this.accounts.slice(0, -2) : this.accounts;
      for (let i = 0; i < (c.attack === 'double' ? Math.max(0, c.transactionCount - 2) : c.transactionCount) && ordinary.length > 1; i++) {
        const atMs = 1000 + i * c.txInterval; if (atMs >= c.duration - 1000) break;
        const from = ordinary[i % ordinary.length].id, to = ordinary[(i + 1) % ordinary.length].id;
        plan.push({ from, to, amount: 4 + i % 7, nonce: nonces[from] ?? 0, atMs, entryNodeId: ids[i % ids.length] }); nonces[from] = (nonces[from] ?? 0) + 1;
      }
      const controlled = faulty.map(i=>ids[i]), common: DemoScenario = { ...defaultScenario, id: `fusion-${c.protocol}-${c.seed}`, nodeIds: ids, stakes: resources,
        seed: String(c.seed), selectionVersion: 'sha256-rejection-v1', slotDurationMs: c.slotDuration, slotsPerEpoch: c.epochLength,
        maxSlots: Math.ceil(c.duration / c.slotDuration), blockCapacity: c.capacity, minLatencyMs: c.latencyMin, maxLatencyMs: c.latencyMax,
        offline: c.offlineNodes.map(i => ids[i]), equivocators: [], withholdVotes: [], doubleProposers: [], surroundVoters: [],
        partitions: c.attack === 'partition' ? [{ startMs: c.attackStart, endMs: c.releaseAt, groups: [ids.slice(0, Math.ceil(ids.length / 2)), ids.slice(Math.ceil(ids.length / 2))] }] : [],
        accounts: this.accounts, transactionPlan: plan, observerNodeId: this.observer, entryNodeId: this.observer };
      delete common.stopAfterBlocks;
      if (c.attack === 'byzantine') {
        common.faultStartMs = c.attackStart;
        if (c.faultBehavior === 'silent') common.silentNodes = controlled;
        else if (c.faultBehavior === 'invalid') common.invalidSigners = controlled;
        else if (c.faultBehavior === 'surround') common.surroundVoters = controlled;
        else if (c.faultBehavior === 'equivocate') { common.equivocators = controlled; common.doubleProposers = controlled; }
        else { common.withholdVotes = controlled; if (c.faultBehavior === 'default') common.doubleProposers = controlled; }
      }
      if (c.protocol === 'pos') { this.raw = new PosHarness(common); this.raw.windowEndMs = Math.min(c.duration, common.maxSlots * c.slotDuration); }
      else {
        const pow: PowScenario = { id: common.id, seed: String(c.seed), powers: resources, nodeIds: ids, meanBlockTimeMs: c.blockInterval, confirmations: c.confirmations,
          maxDurationMs: c.duration, blockCapacity: c.capacity, minLatencyMs: c.latencyMin, maxLatencyMs: c.latencyMax, offline: common.offline, partitions: common.partitions,
          accounts: this.accounts, transactionPlan: plan, observerNodeId: this.observer, entryNodeId: this.observer };
        if (['majority', 'double'].includes(c.attack)) pow.privateAttack = { minerId: controlled[0], startAtMs: c.attackStart, releaseAtMs: c.releaseAt };
        if (c.attack === 'double') {
          const from = this.accounts.at(-2)!.id, to = this.accounts.at(-1)!.id;
          const payment = { from, to, amount: 80, nonce: 0, atMs: c.attackStart + 150, entryNodeId: this.observer };
          const conflict = { ...payment, to: from, atMs: c.attackStart, entryNodeId: controlled[0] };
          pow.merchant = { nodeId: this.observer, transactionIndex: plan.length, conflictingIndex: plan.length + 1, confirmations: c.confirmations };
          pow.privateAttack!.excludedTransactionIndex = plan.length; plan.push(payment, conflict);
        }
        this.raw = new PowSimulation(pow);
      }
      for (const p of plan) this.raw.submitTransaction(this.raw.transaction(p.from, p.to, p.amount, p.nonce), p.entryNodeId, p.atMs);
    }
    this.sync();
  }
  get time() { return this.raw instanceof Reference ? this.raw.time : this.raw.nowMs; }
  step(): Observation[] {
    if (this.done) return [];
    const start = this.trace.length;
    if (this.raw instanceof Reference) { this.raw.step(); this.done = this.raw.done; this.termination = this.raw.termination; }
    else if (!this.raw.step()) { this.done = true; this.termination = 'duration'; }
    if (++this.steps > 250000 || this.trace.length > 120000) { this.done = true; this.termination = 'event-limit'; }
    this.sync(); return this.trace.slice(start);
  }
  advance(until: number, maxEvents = 50000) { let count = 0; while (!this.done && this.time < until && count++ < maxEvents) this.step(); return this.snapshot(); }
  run() { while (!this.done) this.step(); return this.snapshot(); }
  private sync() {
    if (this.raw instanceof Reference) {
      for (const [id, b] of this.raw.blocks) this.blocks.set(id, b);
      for (const [id, t] of this.raw.transactions) this.transactions.set(id, t);
      for (const [id, time] of this.raw.submitted) this.submitted.set(id, time);
      while (this.eventIndex < this.raw.trace.length) { const e = this.raw.trace[this.eventIndex++]; this.trace.push({ ...e, seq: this.trace.length }); }
      return;
    }
    const r = this.raw;
    for (const n of r.nodes.values()) for (const [id, b] of n.blocks) if (!this.blocks.has(id)) this.blocks.set(id, block(b));
    if (r instanceof PowSimulation) for (const [id, b] of r.catalog) if (!this.blocks.has(id)) this.blocks.set(id, block(b));
    for (const t of r.transactions) this.transactions.set(t.id, tx(t));
    while (this.eventIndex < r.observations.length) {
      const e = r.observations[this.eventIndex++], p = e.payload as Record<string, any>;
      let type = e.type, data: Record<string, any> = { ...p };
      if (type === 'TX_SUBMITTED') { this.submitted.set(p.txId, e.simTimeMs); const t = this.transactions.get(p.txId); data = { ...data, tx: p.txId, from: t?.from, to: t?.to }; }
      if (type === 'RUN_STATUS_CHANGED' && p.status === 'finished') type = 'RUN_FINISHED';
      if (type === 'FAULT_EVIDENCE') data = { ...p, offender: p.offenderId, kind: p.evidenceType };
      if (type === 'MESSAGE_DELIVERED') { const received = this.receptions.get(p.contentId) ?? {}; received[e.nodeId!] ??= e.simTimeMs; this.receptions.set(p.contentId, received); }
      if (type === 'HEAD_CHANGED') data = { ...p, head: p.newHeadId, height: this.blocks.get(p.newHeadId)?.height, removed: p.removedBlockIds, added: p.addedBlockIds };
      if (type === 'BLOCK_PROPOSED' || type === 'BLOCK_ACCEPTED_LOCAL') data = { ...p, block: p.blockId, parent: p.parentId, height: this.blocks.get(p.blockId)?.height };
      if (type === 'PRIVATE_CHAIN_RELEASED') data = { ...p, blocks: p.count };
      if (type === 'DOUBLE_SPEND_OBSERVED') { type = 'DOUBLE_SPEND_SUCCEEDED'; data = { ...p, payment: p.txId, conflict: p.conflictingTxId }; }
      if (type === 'CHECKPOINT_JUSTIFIED' || type === 'CHECKPOINT_FINALIZED') {
        const by = this.certificateReceivers.get(p.certificateId) ?? new Set(); by.add(e.nodeId!); this.certificateReceivers.set(p.certificateId, by);
        const cert = r instanceof PosHarness ? r.certificates.get(p.certificateId) : null;
        data = { ...p, epoch: p.checkpoint.epoch, block: p.checkpoint.blockId, votes: cert?.votes.length, weight: cert?.votes.reduce((s, v) => s + r.config.validators.find(n => n.id === v.signerId)!.stake, 0) };
      }
      this.trace.push({ seq: this.trace.length, time: e.simTimeMs, type, node: e.nodeId, data });
      if (e.nodeId === this.observer && type === 'HEAD_CHANGED') for (const id of p.addedBlockIds ?? []) for (const t of this.blocks.get(id)?.txs ?? []) if (!this.included.has(t.id)) this.included.set(t.id, e.simTimeMs);
      if (e.nodeId === this.observer && type === 'CHECKPOINT_FINALIZED') for (const b of ancestors(this.blocks, p.checkpoint.blockId)) for (const t of b.txs) if (!this.settled.has(t.id)) this.settled.set(t.id, e.simTimeMs);
      if (e.nodeId === this.observer && type === 'TX_CONFIRMED_LOCAL' && !this.settled.has(p.txId)) this.settled.set(p.txId, e.simTimeMs);
    }
  }
  metrics(): Metrics {
    if (this.raw instanceof Reference) return this.raw.metrics();
    const r = this.raw, c = this.config, n = r.nodes.get(this.observer)!, chain = ancestors(this.blocks, n.headId), height = chain.at(-1)!.height;
    const final = r instanceof PosHarness ? this.blocks.get(r.nodes.get(this.observer)!.finalized.blockId)!.height : 0;
    const included = chain.flatMap(b => b.txs), secured = chain.filter(b => c.protocol === 'pow' ? height - b.height + 1 >= c.confirmations : b.height <= final).flatMap(b => b.txs);
    const delays = (transactions: Transaction[], times: Map<string, number>) => transactions.filter(t => times.has(t.id) && this.submitted.has(t.id)).map(t => times.get(t.id)! - this.submitted.get(t.id)!);
    const inc = delays(included, this.included), settlement = delays(secured, this.settled), events = this.trace, local = events.filter(e => e.node === this.observer && e.type === 'HEAD_CHANGED');
    return { observer: this.observer, time: this.time, blocks: height, transactions: included.length, settledTransactions: secured.length,
      tps: this.time ? included.length / (this.time / 1000) : 0, settledTps: this.time ? secured.length / (this.time / 1000) : 0,
      messages: events.filter(e => e.type === 'MESSAGE_SENT').length, delivered: events.filter(e => e.type === 'MESSAGE_DELIVERED').length, dropped: events.filter(e => e.type === 'MESSAGE_DROPPED').length,
      reorgs: local.filter(e => e.data.removed?.length).length, maxReorg: Math.max(0, ...local.map(e => e.data.removed?.length ?? 0)), finalizedHeight: final,
      confirmedHeight: Math.max(0, height - c.confirmations + 1), medianInclusion: percentile(inc, .5), p95Inclusion: percentile(inc, .95), medianSettlement: percentile(settlement, .5),
      unfinished: Math.max(0, this.submitted.size - secured.length), faults: r instanceof PosHarness ? r.evidence.size : 0,
      heads: new Set([...r.nodes.values()].filter((_, i) => !c.offlineNodes.includes(i) && !controlledIndices(c).includes(i)).map(n => n.headId)).size,
      doubleSpend: r instanceof PowSimulation && c.attack === 'double' ? r.merchantState.doubleSpendObserved ? 'success' : this.done ? 'failed' : r.merchantState.delivered ? 'merchant-accepted' : 'pending' : 'not-attempted' };
  }
  private inspection(): NonNullable<Snapshot['inspection']> {
    const r = this.raw, c = this.config, result: NonNullable<Snapshot['inspection']> = { model: FUSION_MODEL, votes: [], certificates: [], evidence: [], accounts: this.accounts, mining: [], knownBlocks: {}, submitted: Object.fromEntries(this.submitted) };
    if (r instanceof Reference) {
      for (const n of r.nodes) {
        result.knownBlocks[n.id] = [...n.blocks.keys()];
        for (const cert of n.pbft.certificates.values()) {
          const id = hash({ view: cert.view, sequence: cert.sequence, block: cert.block.id, commits: cert.commits.map(m => m.signature).sort() });
          const existing = result.certificates.find(x => x.id === id);
          if (existing) existing.verifiedBy.push(n.id);
          else result.certificates.push({ id, kind: 'PBFT COMMIT', block: cert.block.id, sequence: cert.sequence, view: cert.view, weight: new Set(cert.commits.map(m => m.from)).size, total: consensusIndices(c).length, signers: cert.commits.map(m => m.from), signatures: cert.commits.map(m => m.signature), verifiedBy: [n.id] });
        }
      }
      result.evidence = r.trace.filter(e => e.type === 'FAULT_EVIDENCE').map(e => ({ id: hash(e.data), kind: e.data.kind, offender: e.data.offender ?? e.node, proof: e.data }));
      return result;
    }
    for (const n of r.nodes.values()) result.knownBlocks[n.id] = [...n.blocks.keys()];
    if (r instanceof PowSimulation) {
      result.mining = [...r.proofs.values()].map(p => ({ id: p.id, miner: p.minerId, block: p.blockId, time: p.discoveredAtMs, work: this.blocks.get(p.blockId)!.work, private: this.trace.some(e => e.type === 'MINING_DISCOVERY' && e.data.blockId === p.blockId && e.data.private) }));
    } else {
      for (const { vote: v, signedAtMs, firstSentAtMs } of r.voteRecords.values()) {
        const p = v.payload, kind = p.kind, id = v.id, usedBy: string[] = [];
        for (const n of r.nodes.values()) if (kind === 'headVote' ? n.state.latestHeadVotes.get(v.signerId)?.id === id : n.state.linkVotes.has(id) && linkIsLocallyVerifiable(v as any, r.view(n.id))) usedBy.push(n.id);
        result.votes.push({ id, validator: v.signerId, kind, slot: kind === 'headVote' ? p.slot : p.target.epoch * c.epochLength, block: kind === 'headVote' ? p.blockId : p.target.blockId,
          source: kind === 'linkVote' ? p.source.blockId : undefined, sourceEpoch: kind === 'linkVote' ? p.source.epoch : undefined, targetEpoch: kind === 'linkVote' ? p.target.epoch : undefined,
          weight: r.config.validators.find(n => n.id === v.signerId)!.stake, signature: v.signature, signedAt: signedAtMs, sentAt: firstSentAtMs, received: this.receptions.get(id) ?? {}, usedBy });
      }
      for (const cert of r.certificates.values()) result.certificates.push({ id: cert.id, kind: 'PoS ≥ 2/3', block: cert.target.blockId, source: cert.source.blockId,
        sourceEpoch: cert.source.epoch, epoch: cert.target.epoch, weight: cert.votes.reduce((s, v) => s + r.config.validators.find(n => n.id === v.signerId)!.stake, 0), total: r.config.validators.reduce((s, n) => s + n.stake, 0), signers: cert.votes.map(v => v.signerId), signatures: cert.votes.map(v => v.signature), verifiedBy: [...r.nodes.values()].filter(n => n.state.handledCertificates.has(cert.id)).map(n => n.id) });
      result.evidence = [...r.evidence.values()].map(e => ({ id: e.id, kind: e.kind, offender: e.offenderId, proof: e }));
    }
    return result;
  }
  snapshot(): Snapshot {
    this.sync();
    if (this.raw instanceof Reference) return { ...this.raw.snapshot(), modelVersion: FUSION_MODEL, done: this.done, termination: this.termination, inspection: this.inspection() };
    const r = this.raw, c = this.config, faulty = controlledIndices(c);
    const merchant = r instanceof PowSimulation && r.scenario.merchant ? { acceptedAt: r.merchantState.acceptedAtMs, payment: r.transactions[r.scenario.merchant.transactionIndex]?.id ?? null, conflict: r.transactions[r.scenario.merchant.conflictingIndex]?.id ?? null } : { acceptedAt: null, payment: null, conflict: null };
    return { schemaVersion: 1, modelVersion: FUSION_MODEL, config: structuredClone(c), time: this.time, done: this.done, termination: this.termination, nextSeq: this.trace.length,
      metrics: this.metrics(), blocks: [...this.blocks.values()], transactions: [...this.transactions.values()], events: this.trace.slice(-250), merchant,
      nodes: [...r.nodes.values()].map((n, i) => ({ id: n.id, participates: consensusIndices(c).includes(i), faulty: faulty.includes(i), power: c.protocol === 'pow' ? r.config.validators[i].hashPower : 0, stake: c.protocol === 'pos' ? r.config.validators[i].stake : 0,
        head: n.headId, height: this.blocks.get(n.headId)!.height, finalizedHeight: r instanceof PosHarness ? this.blocks.get(r.nodes.get(n.id)!.finalized.blockId)!.height : 0,
        view: 0, pending: n.state.pending.size, ledger: ledger(n.ledger) })), inspection: this.inspection() };
  }
  export() { return { schemaVersion: 1, modelVersion: FUSION_MODEL, config: structuredClone(this.config), metrics: this.metrics(), trace: structuredClone(this.trace), snapshot: this.snapshot(), proofRecord: this.raw.export(), pbftCertificates: this.raw instanceof Reference ? this.raw.nodes.flatMap(n => [...n.pbft.certificates.values()]) : [], limitations: ['Simulation pédagogique ; clés de démonstration publiquement reproductibles, distinctes de MetaMask.', 'PoW réseau probabiliste à difficulté fixe ; calcul SHA-256 dans l’atelier Miner.', 'PoS inspiré de Gasper à mises fixes ; économie dans l’atelier Miser.', 'PBFT : participants fixes, n=3f+1, progression sous hypothèses de réseau et de fautes.'] }; }
}
