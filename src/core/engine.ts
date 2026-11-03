import { configuration } from './config.js';
import { committeeIds, controlledIndices, consensusIndices } from './participants.js';
import { EventQueue, Random, canonical, hash, sign, verify } from './primitives.js';
import { ACCOUNTS, accountIds, ancestors, applyTransactions, descends, genesis, genesisLedger, makeBlock, transaction, validTransaction, validateBlock } from './ledger.js';
import type { Block, Config, ConsensusModule, Ledger, Message, Metrics, ModuleContext, NodeState, Observation, Snapshot, Transaction } from './types.js';
import { pow } from '../consensus/pow/index.js';
import { pos } from '../consensus/pos/index.js';
import { pbft } from '../consensus/pbft/index.js';
export const MODEL_VERSION = 'atelier-1.0.0';
export class Simulation {
    readonly config: Config;
    readonly nodes: NodeState[];
    readonly trace: Observation[] = [];
    readonly blocks = new Map<string, Block>();
    readonly transactions = new Map<string, Transaction>();
    readonly submitted = new Map<string, number>();
    readonly firstInclusion = new Map<string, number>();
    readonly firstSettlement = new Map<string, number>();
    readonly observer: string;
    readonly merchant = { acceptedAt: null as number | null, payment: null as string | null, conflict: null as string | null };
    time = 0;
    done = false;
    termination: 'duration' | 'event-limit' | null = null;
    messages = 0;
    delivered = 0;
    dropped = 0;
    reorgs = 0;
    maxReorg = 0;
    faults = 0;
    private queue = new EventQueue();
    private order = 0;
    private messageSeq = 0;
    private network: Random;
    private protocolRandom: Random;
    private domain: string;
    private module: ConsensusModule;
    private signCache = new Map<string, string>();
    private verified = new Map<string, boolean>();
    private evidence = new Set<string>();
    private success = false;
    constructor(input: Partial<Config> = {}) {
        this.config = configuration(input);
        const c = this.config;
        this.network = new Random(c.seed ^ 0x1234);
        this.protocolRandom = new Random(c.seed ^ 0x7890);
        this.domain = hash({ model: MODEL_VERSION, config: c });
        const g = genesis(c.protocol);
        this.blocks.set(g.id, g);
        const controlled = controlledIndices(c), faultyCount = controlled.length;
        this.nodes = Array.from({ length: c.nodeCount }, (_, i) => {
            const cp = { epoch: 0, block: g.id };
            const power = i === 0 && faultyCount ? c.attackerShare * 100 : ((faultyCount ? 1 - c.attackerShare : 1) * 100) / (c.nodeCount - (faultyCount ? 1 : 0));
            const stake = c.attack === 'byzantine' ? (i < faultyCount ? c.attackerShare / faultyCount : (1 - c.attackerShare) / (c.nodeCount - faultyCount)) * 1000000 : 1000000 / c.nodeCount;
            return { id: 'n' + i, index: i, faulty: controlled.includes(i), power: c.protocol === 'pbft' ? 0 : power, stake: c.protocol === 'pbft' ? 0 : Math.round(stake), blocks: new Map([[g.id, g]]), ledgers: new Map([[g.id, genesisLedger(accountIds(c.protocol === 'pbft' ? c.accountCount : 6))]]), mempool: new Map(), head: g.id, finalized: cp, justified: cp, justifiedSet: new Map([['0:' + g.id, cp]]), pendingBlocks: new Map(), seen: new Set(), timers: new Map(), privateHead: null, privateBlocks: [], privateTransactions: new Map(), released: false, headVotes: new Map(), linkVotes: new Map(), votedEpochs: new Set(), votesHistory: new Map(), pbft: { view: 0, sequence: 1, requestedView: 0, proposals: new Map(), prepares: new Map(), commits: new Map(), sentPrepare: new Set(), sentCommit: new Set(), prepared: null, changes: new Map(), sentChanges: new Set(), sentNewViews: new Set(), certificates: new Map(), pending: [], future: [] } } satisfies NodeState;
        });
        this.observer = (this.nodes.find(n => !n.faulty && !c.offlineNodes.includes(n.index)) ?? this.nodes[0]).id;
        this.module = c.protocol === 'pow' ? pow : c.protocol === 'pos' ? pos : pbft;
        let txNumber = 0;
        const nonces: Record<string, number> = {};
        const users = c.protocol === 'pbft' ? accountIds(c.accountCount) : ACCOUNTS.slice(0, 4);
        for (let t = 1000; t < c.duration - 1000; t += c.txInterval) {
            if (c.protocol === 'pbft' && txNumber >= c.transactionCount) break;
            const from = users[txNumber % users.length], to = users[(txNumber + 1) % users.length];
            const tx = transaction(from, to, 4 + (txNumber % 7), nonces[from] ?? 0);
            nonces[from] = (nonces[from] ?? 0) + 1;
            this.queue.push({ time: t, order: this.order++, kind: 'tx', node: this.nodes[txNumber % c.nodeCount].id, data: tx });
            txNumber++;
        }
        if (c.attack === 'double') {
            const payment = transaction('mallory', 'marchand', 80, 0), conflict = transaction('mallory', 'mallory', 80, 0);
            this.merchant.payment = payment.id;
            this.merchant.conflict = conflict.id;
            this.queue.push({ time: c.attackStart, order: this.order++, kind: 'tx', node: 'n0', data: { tx: conflict, private: true } });
            this.queue.push({ time: c.attackStart + 150, order: this.order++, kind: 'tx', node: this.observer, data: payment });
        }
        this.queue.push({ time: c.attackStart, order: this.order++, kind: 'start', data: 'attack' });
        for (const n of this.nodes) {
            this.queue.push({ time: 0, order: this.order++, kind: 'start', node: n.id });
        }
        this.queue.push({ time: c.duration, order: this.order++, kind: 'end' });
        this.observe(null, 'RUN_CREATED', { protocol: c.protocol, seed: c.seed, observer: this.observer });
    }
    private observe(node: string | null, type: string, data: Record<string, any>) {
        if (type === 'FAULT_EVIDENCE') {
            const k = canonical(data);
            if (this.evidence.has(k))
                return;
            this.evidence.add(k);
            this.faults++;
        }
        if (this.trace.length >= 120000) {
            if (!this.done)
                this.trace.push({ seq: this.trace.length, time: this.time, type: 'RUN_LIMIT_REACHED', node: null, data: { reason: 'trace-limit' } });
            this.done = true;
            this.termination = 'event-limit';
            return;
        }
        this.trace.push({ seq: this.trace.length, time: this.time, type, node, data });
    }
    private blocked(from: string, to: string) { const c = this.config; return c.attack === 'partition' && this.time >= c.attackStart && this.time < c.releaseAt && ((Number(from.slice(1)) < Math.ceil(c.nodeCount / 2)) !== (Number(to.slice(1)) < Math.ceil(c.nodeCount / 2))); }
    private signData(id: string, data: any) { const key = id + canonical(data); let s = this.signCache.get(key); if (!s) {
        s = sign(id, data);
        this.signCache.set(key, s);
    } return s; }
    private verifyData(id: string, data: any, sig: string) { const key = id + hash(data) + sig; if (!this.verified.has(key))
        this.verified.set(key, verify(id, data, sig)); return this.verified.get(key)!; }
    private authData(m: Pick<Message, 'from' | 'type' | 'body'>) { return { domain: this.domain, from: m.from, type: m.type, body: m.body }; }
    private verifyMessage(m: Message) { return !!m && typeof m.id === 'string' && typeof m.type === 'string' && !!m.body && typeof m.body === 'object' && !Array.isArray(m.body) && this.nodes.some(n => n.id === m.from) && this.verifyData(m.from, this.authData(m), m.signature); }
    private send(node: NodeState, to: string, type: string, body: any) {
        if (!this.nodes.some(n => n.id === to))
            return;
        if (this.config.protocol === 'pbft' && node.faulty && this.time >= this.config.attackStart && (this.config.faultBehavior === 'silent' || (this.config.faultBehavior === 'withhold' && ['PREPARE', 'COMMIT'].includes(type)))) { this.observe(node.id, 'MESSAGE_WITHHELD', { to, messageType: type }); return; }
        const m: Message = { id: 'm' + this.messageSeq++, from: node.id, to, type, body: structuredClone(body), sentAt: this.time, signature: this.signData(node.id, this.authData({ from: node.id, type, body })) };
        if (this.config.protocol === 'pbft' && node.faulty && this.time >= this.config.attackStart && this.config.faultBehavior === 'invalid') m.signature = '00'.repeat(64);
        if (to !== node.id) {
            this.messages++;
            this.observe(node.id, 'MESSAGE_SENT', { id: m.id, to, messageType: type });
        }
        if (this.blocked(node.id, to) || this.config.offlineNodes.includes(Number(to.slice(1)))) {
            this.dropped++;
            this.observe(node.id, 'MESSAGE_DROPPED', { id: m.id, to, reason: 'partition' });
            return;
        }
        const delay = to === node.id ? 0 : this.config.latencyMin + Math.floor(this.network.next() * (this.config.latencyMax - this.config.latencyMin + 1));
        this.queue.push({ time: this.time + delay, order: this.order++, kind: 'message', node: to, data: m });
    }
    private accept(node: NodeState, b: Block): boolean {
        if (!b || typeof b !== 'object' || typeof b.id !== 'string' || typeof b.parent !== 'string' || !Array.isArray(b.txs)) return false;
        if (node.blocks.has(b.id))
            return true;
        const parent = b.parent ? node.blocks.get(b.parent) : undefined;
        if (!parent) {
            node.pendingBlocks.set(b.id, b);
            for (const id of this.nodes.map(n => n.id))
                if (id !== node.id)
                    this.send(node, id, 'GET_BLOCK', { id: b.parent });
            return false;
        }
        try {
            if (b.time > this.time)
                throw new Error('BLOCK_FROM_FUTURE');
            if (b.protocol === 'pos') {
                const slot = Math.floor(b.time / this.config.slotDuration);
                if (b.slot !== slot || b.time !== slot * this.config.slotDuration || b.producer !== this.proposer(slot) || b.slot <= parent.slot)
                    throw new Error('PROPOSER_INVALID');
            }
            const state = validateBlock(b, parent, node.ledgers.get(parent.id)!, this.config.capacity, this.config.protocol === 'pbft' ? committeeIds(this.config) : this.nodes.map(n => n.id));
            // PoW discoveries are simulation certificates, not actual hashes below a target.
            if (b.protocol === 'pow' && !this.blocks.has(b.id))
                throw new Error('DISCOVERY_NOT_ISSUED');
            node.blocks.set(b.id, structuredClone(b));
            node.ledgers.set(b.id, state);
            node.pendingBlocks.delete(b.id);
            for (const t of b.txs)
                this.transactions.set(t.id, t);
            this.observe(node.id, 'BLOCK_ACCEPTED_LOCAL', { block: b.id, height: b.height });
            return true;
        }
        catch (e) {
            this.observe(node.id, 'BLOCK_REJECTED_LOCAL', { block: b.id, reason: String((e as Error).message) });
            return false;
        }
    }
    private adopt(node: NodeState, id: string): boolean {
        if (!node.blocks.has(id) || id === node.head)
            return false;
        if (this.config.protocol !== 'pow' && !descends(node.blocks, id, node.finalized.block))
            return false;
        const old = ancestors(node.blocks, node.head), next = ancestors(node.blocks, id);
        let common = 0;
        while (common < old.length && common < next.length && old[common].id === next[common].id)
            common++;
        const removed = old.slice(common).map(b => b.id);
        node.head = id;
        if (removed.length) {
            for (const b of old.slice(common))
                for (const tx of b.txs)
                    node.mempool.set(tx.id, tx);
            if (node.id === this.observer) {
                this.reorgs++;
                this.maxReorg = Math.max(this.maxReorg, removed.length);
            }
        }
        const state = node.ledgers.get(id)!;
        for (const [tid, tx] of node.mempool)
            if (state[tx.from].nonce > tx.nonce)
                node.mempool.delete(tid);
        this.observe(node.id, 'HEAD_CHANGED', { head: id, height: node.blocks.get(id)!.height, removed, added: next.slice(common).map(b => b.id) });
        return true;
    }
    private context(node: NodeState): ModuleContext {
        return { config: this.config, now: this.time, node, ids: this.config.protocol === 'pbft' ? committeeIds(this.config) : this.nodes.map(n => n.id), random: () => this.protocolRandom.next(),
            after: (name, delay, data) => { const generation = (node.timers.get(name) ?? 0) + 1; node.timers.set(name, generation); this.queue.push({ time: this.time + Math.max(1, Math.round(delay)), order: this.order++, kind: 'timer', node: node.id, data: { name, generation, data } }); },
            send: (to, type, body) => this.send(node, to, type, body), broadcast: (type, body) => {
                let alternative: Block | null = null;
                if (this.config.protocol === 'pbft' && node.faulty && this.time >= this.config.attackStart && this.config.faultBehavior === 'equivocate' && type === 'PRE_PREPARE') {
                    const b = body.block as Block; alternative = makeBlock(node.blocks.get(b.parent!)!, node.id, this.time, b.txs, 'pbft', b.slot + 1); this.blocks.set(alternative.id, alternative);
                    this.observe(node.id, 'FAULT_EVIDENCE', { offender: node.id, kind: 'double-pbft-proposal', first: b, second: alternative, view: body.view, sequence: body.sequence });
                }
                this.nodes.filter(n => this.config.protocol !== 'pbft' || type === 'COMMITTED' || this.config.consensusNodes.includes(n.index)).forEach((n, i) => this.send(node, n.id, type, alternative && i % 2 ? { ...body, block: alternative } : body)); },
            observe: (type, data) => this.observe(node.id, type, data),
            propose: (txs, slot = 0, parent = node.head) => { if (this.config.protocol === 'pbft' && !this.config.consensusNodes.includes(node.index)) throw new Error('OBSERVER_CANNOT_PROPOSE'); const p = node.blocks.get(parent)!; const b = makeBlock(p, node.id, this.time, txs ?? this.select(node, parent), this.config.protocol, slot); this.blocks.set(b.id, b); this.observe(node.id, 'BLOCK_PROPOSED', { block: b.id, height: b.height, parent, producer: node.id }); return b; },
            accept: b => this.accept(node, b), adopt: id => this.adopt(node, id), select: (parent = node.head, exclude) => this.select(node, parent, exclude),
            sign: data => this.signData(node.id, { domain: this.domain, data }), verify: (id, data, sig) => this.verifyData(id, { domain: this.domain, data }, sig),
            verifyMessage: m => this.verifyMessage(m), weight: id => this.nodes.find(n => n.id === id)?.stake ?? 0 };
    }
    private select(node: NodeState, parent: string, exclude = new Set<string>()) {
        let state = structuredClone(node.ledgers.get(parent)!);
        const result: Transaction[] = [];
        const pool = new Map(node.mempool);
        if (node.faulty && (parent === node.privateHead || node.privateBlocks.includes(parent)))
            for (const [id, tx] of node.privateTransactions)
                pool.set(id, tx);
        let candidates = [...pool.values()].filter(t => !exclude.has(t.id));
        let progress = true;
        while (progress && result.length < this.config.capacity) {
            progress = false;
            const pending: Transaction[] = [];
            for (const t of candidates) {
                if (result.length >= this.config.capacity) {
                    pending.push(t);
                    continue;
                }
                try {
                    state = applyTransactions(state, [t]);
                    result.push(t);
                    progress = true;
                }
                catch {
                    pending.push(t);
                }
            }
            candidates = pending;
        }
        return result;
    }
    proposer(slot: number) { const r = new Random((this.config.seed ^ Math.imul(slot + 1, 2654435761)) >>> 0).next(); const total = this.nodes.reduce((a, n) => a + n.stake, 0); let target = r * total; for (const n of this.nodes) {
        target -= n.stake;
        if (target < 0)
            return n.id;
    } return this.nodes.at(-1)!.id; }
    step(): Observation[] {
        if (this.done)
            return [];
        const start = this.trace.length, e = this.queue.pop();
        if (!e) {
            this.done = true;
            return [];
        }
        this.time = e.time;
        if (e.kind === 'end') {
            this.done = true;
            this.termination = 'duration';
            this.observe(null, 'RUN_FINISHED', {});
            this.measure();
            return this.trace.slice(start);
        }
        const node = e.node ? this.nodes.find(n => n.id === e.node) : undefined;
        if (node && this.config.offlineNodes.includes(node.index)) { this.measure(); return this.trace.slice(start); }
        if (e.kind === 'start') {
            if (node) {
                const ctx = this.context(node);
                this.module.init(ctx);
                ctx.after('$sync', 2000);
            }
            else if (this.config.attack !== 'none')
                this.observe(null, 'ATTACK_STARTED', { attack: this.config.attack });
        }
        if (e.kind === 'tx' && node) {
            const tx = (e.data.tx ?? e.data) as Transaction;
            this.transactions.set(tx.id, tx);
            this.submitted.set(tx.id, this.time);
            node.mempool.set(tx.id, tx);
            if (e.data.private)
                node.privateTransactions.set(tx.id, tx);
            this.observe(node.id, 'TX_SUBMITTED', { tx: tx.id, from: tx.from, to: tx.to, private: !!e.data.private });
            if (!e.data.private)
                for (const n of this.nodes)
                    if (n.id !== node.id && (this.config.protocol !== 'pbft' || this.config.consensusNodes.includes(n.index)))
                        this.send(node, n.id, 'TX', tx);
        }
        if (e.kind === 'timer' && node) {
            const { name, generation, data } = e.data;
            if (node.timers.get(name) === generation) {
                const ctx = this.context(node);
                if (name === '$sync') {
                    for (const b of [...node.pendingBlocks.values()])
                        if (this.accept(node, b))
                            this.module.message(ctx, { type: 'BLOCK', body: b } as Message);
                    const b = node.blocks.get(node.head)!;
                    if (b.height && (this.config.protocol !== 'pbft' || this.config.consensusNodes.includes(node.index)))
                        this.context(node).broadcast('BLOCK', b);
                    // A partition may lose a payment while later nonces survive elsewhere.
                    // Retransmit a bounded set from this node's own mempool after reconnection.
                    if (this.config.protocol === 'pbft') {
                        const state = node.ledgers.get(node.head)!;
                        for (const t of [...node.mempool.values()].filter(t => t.nonce >= state[t.from].nonce).sort((a,b) => a.nonce-b.nonce || a.id.localeCompare(b.id)).slice(0, this.config.capacity * 2)) ctx.broadcast('TX', t);
                    }
                    this.module.timer(ctx, 'sync', null);
                    ctx.after('$sync', 2000);
                }
                else
                    this.module.timer(ctx, name, data);
            }
        }
        if (e.kind === 'message' && node) {
            const m = e.data as Message;
            if (this.blocked(m.from, m.to)) {
                this.dropped++;
                this.observe(node.id, 'MESSAGE_DROPPED', { id: m.id, to: m.to, reason: 'partition' });
            }
            else if (!node.seen.has(m.id) && this.verifyMessage(m)) {
                node.seen.add(m.id);
                if (m.to !== m.from) {
                    this.delivered++;
                    this.observe(node.id, 'MESSAGE_DELIVERED', { id: m.id, from: m.from, messageType: m.type });
                }
                if (m.type === 'TX') {
                    const tx = m.body as Transaction;
                    if (validTransaction(tx, Object.keys(node.ledgers.get(node.head)!)) && !node.mempool.has(tx.id) && node.ledgers.get(node.head)![tx.from].nonce <= tx.nonce)
                        node.mempool.set(tx.id, tx);
                }
                else if (m.type === 'GET_BLOCK') {
                    const b = node.blocks.get(m.body.id);
                    if (b && !(node.privateBlocks.includes(b.id) && !node.released))
                        this.send(node, m.from, 'BLOCK', b);
                }
                else {
                    if (m.type !== 'BLOCK' || this.accept(node, m.body))
                        try { this.module.message(this.context(node), m); } catch { this.observe(node.id, 'MESSAGE_REJECTED_LOCAL', { id: m.id, messageType: m.type, reason: 'malformed-payload' }); }
                }
            }
            else if (!node.seen.has(m.id)) this.observe(node.id, 'MESSAGE_REJECTED_LOCAL', { id: m.id, messageType: m.type, reason: 'signature-or-shape' });
        }
        this.measure();
        return this.trace.slice(start);
    }
    advance(until: number, maxEvents = 50000) { let count = 0; while (!this.done && this.time < until && count++ < maxEvents)
        this.step(); return this.snapshot(); }
    run() { let i = 0; while (!this.done && i++ < 300000)
        this.step(); if (!this.done)
        throw new Error('EVENT_LIMIT'); return this.snapshot(); }
    private measure() {
        const n = this.nodes.find(n => n.id === this.observer)!;
        const chain = ancestors(n.blocks, n.head);
        const h = chain.at(-1)!.height;
        const finalH = n.blocks.get(n.finalized.block)!.height;
        for (const b of chain)
            for (const t of b.txs) {
                if (!this.firstInclusion.has(t.id))
                    this.firstInclusion.set(t.id, this.time);
                const settled = this.config.protocol === 'pow' ? h - b.height + 1 >= this.config.confirmations : b.height <= finalH;
                if (settled && !this.firstSettlement.has(t.id))
                    this.firstSettlement.set(t.id, this.time);
            }
        const payment = chain.find(b => b.txs.some(t => t.id === this.merchant.payment));
        if (payment && h - payment.height + 1 >= this.config.confirmations && this.merchant.acceptedAt === null) {
            this.merchant.acceptedAt = this.time;
            this.observe(this.observer, 'MERCHANT_ACCEPTED', { tx: this.merchant.payment, confirmations: this.config.confirmations });
        }
        const conflict = chain.find(b => b.txs.some(t => t.id === this.merchant.conflict));
        if (this.merchant.acceptedAt !== null && !payment && conflict && h - conflict.height + 1 >= this.config.confirmations && !this.success) {
            this.success = true;
            this.observe(this.observer, 'DOUBLE_SPEND_SUCCEEDED', { payment: this.merchant.payment, conflict: this.merchant.conflict });
        }
    }
    metrics(): Metrics {
        const n = this.nodes.find(n => n.id === this.observer)!;
        const chain = ancestors(n.blocks, n.head), height = chain.at(-1)!.height, finalH = n.blocks.get(n.finalized.block)!.height;
        const included = chain.flatMap(b => b.txs);
        const settled = chain.filter(b => this.config.protocol === 'pow' ? height - b.height + 1 >= this.config.confirmations : b.height <= finalH).flatMap(b => b.txs);
        const delays = (map: Map<string, number>, txs: Transaction[]) => txs.map(t => (map.get(t.id) ?? this.time) - (this.submitted.get(t.id) ?? 0)).sort((a, b) => a - b);
        const inclusion = delays(this.firstInclusion, included), settlement = delays(this.firstSettlement, settled);
        const percentile = (a: number[], p: number) => a.length ? a[Math.max(0, Math.ceil(p * a.length) - 1)] : null;
        return { observer: n.id, time: this.time, blocks: height, transactions: included.length, settledTransactions: settled.length, tps: this.time ? included.length / (this.time / 1000) : 0, settledTps: this.time ? settled.length / (this.time / 1000) : 0, messages: this.messages, delivered: this.delivered, dropped: this.dropped, reorgs: this.reorgs, maxReorg: this.maxReorg, finalizedHeight: finalH, confirmedHeight: Math.max(0, height - this.config.confirmations + 1), medianInclusion: percentile(inclusion, .5), p95Inclusion: percentile(inclusion, .95), medianSettlement: percentile(settlement, .5), unfinished: Math.max(0, this.submitted.size - settled.length), faults: this.faults, heads: new Set(this.nodes.filter(n => !n.faulty).map(n => n.head)).size, doubleSpend: this.config.attack !== 'double' ? 'not-attempted' : this.success ? 'success' : this.done ? 'failed' : this.merchant.acceptedAt !== null ? 'merchant-accepted' : 'pending' };
    }
    snapshot(): Snapshot { return { schemaVersion: 1, modelVersion: MODEL_VERSION, config: { ...this.config }, time: this.time, done: this.done, termination: this.termination, nextSeq: this.trace.length, metrics: this.metrics(), blocks: [...this.blocks.values()].map(b => ({ ...b, txs: [...b.txs] })), transactions: [...this.transactions.values()], events: this.trace.slice(-250), nodes: this.nodes.map(n => ({ id: n.id, participates: consensusIndices(this.config).includes(n.index), faulty: n.faulty, power: n.power, stake: n.stake, head: n.head, height: n.blocks.get(n.head)!.height, finalizedHeight: n.blocks.get(n.finalized.block)!.height, view: n.pbft.view, pending: n.mempool.size, ledger: structuredClone(n.ledgers.get(n.head)!) })), merchant: { ...this.merchant } }; }
    export() { return { schemaVersion: 1, modelVersion: MODEL_VERSION, config: this.config, metrics: this.metrics(), trace: this.trace, snapshot: this.snapshot(), limitations: ['PoW : découvertes simulées, pas de minage réel.', 'PoS : modèle inspiré de Gasper, poids fixes et sanctions non exécutées.', 'Clés publiques de démonstration, jamais pour des fonds réels.'] }; }
}
