// Hôte PoW : même registre, signatures, file de priorité et réseau virtuel que les services du lot PoS.
// Chaque mineur garde sa vue locale ; seuls les événements livrés peuvent la modifier.
type KeyObject = Uint8Array;
import type { Block, Ledger, Observation, Transaction } from '../../contracts/src/index.js';
import type { PowConfig, PowContext, PowEffect, PowInput, PowMessage, PowNode, PowPayload, PowScenario, PowView } from '../../contracts/src/pow.js';
import { PowAdapter, choosePowHead, cumulativeWork, discoveryDelay, isPowBlock, powMessageId, verifyPowMessage } from '../../consensus/pow/src/index.js';
import { applyTransactions, blockId, demoIdentity, freezeData, hash, integer, ledgerAt, makeBlock, selectTransactions, signId, txId, verifyId, verifyTransactionEnvelope } from '../../core/src/index.js';
import { EventQueue } from './eventQueue.js';
import { powScenarioFromSettings } from '../../scenarios/src/pow.js';

type Event = { atMs: number; seq: number; nodeId: string } & ({ kind: 'discover'; count: number } | { kind: 'timer'; timerId: string; generation: number }
    | { kind: 'deliver'; from: string; message: PowMessage; sentAtMs: number; transportId: string } | { kind: 'tx'; tx: Transaction });
export interface SimulatedWorkProof { id: string; minerId: string; discoveredAtMs: number; workUnits: 1; blockId: string }
export class PowSimulation {
    readonly protocol = 'pow' as const;
    readonly scenario: PowScenario;
    readonly config: PowConfig;
    readonly accounts: PowScenario['accounts'];
    readonly genesis: Block;
    readonly genesisLedger: Ledger;
    readonly accountKeys: Map<string, string>;
    readonly domain: string;
    readonly nodes = new Map<string, PowNode>();
    readonly messages = new Map<string, PowMessage>();
    readonly observations: Observation[] = [];
    readonly transactions: Transaction[] = [];
    readonly proofs = new Map<string, SimulatedWorkProof>();
    readonly catalog = new Map<string, Block>();
    readonly discoveryCounts = new Map<string, number>();
    readonly merchantState = { delivered: false, acceptedAtMs: null as number | null, doubleSpendObserved: false };
    nowMs = 0; windowEndMs: number;
    private keys = new Map<string, KeyObject>();
    private queue = new EventQueue<Event>();
    private adapter = new PowAdapter();
    private activeDiscovery = new Map<string, Block>();
    private seq = 0; private networkCounter = 0; private started = false; private finished = false; private targetReached = false;
    private confirmationsAt = new Map<string, number>();
    constructor(scenario: PowScenario = powScenarioFromSettings({})) {
        this.validateScenario(scenario); this.scenario = freezeData(structuredClone(scenario));
        const validators = scenario.nodeIds.map((id, i) => {
            const identity = demoIdentity(`node-${id}`); this.keys.set(id, identity.privateKey);
            return { id, publicKey: identity.publicKey, stake: 0, hashPower: scenario.powers[i] };
        });
        this.config = freezeData({ seed: scenario.seed, validators, meanBlockTimeMs: scenario.meanBlockTimeMs, confirmations: scenario.confirmations,
            blockCapacity: scenario.blockCapacity, maxDurationMs: scenario.maxDurationMs, discoveryVersion: 'pow-exponential-sha256-v1' as const });
        this.accounts = this.scenario.accounts;
        this.accountKeys = new Map(this.accounts.map(a => [a.id, demoIdentity(`account-${a.id}`).publicKey]));
        this.genesisLedger = new Map(this.accounts.map(a => [a.id, freezeData({ balance: a.initialBalance, nextNonce: 0 })]));
        const header = { protocolVersion: 1 as const, protocol: 'pow' as const, parentId: null, height: 0, producerId: 'genesis', proposedAtMs: 0,
            txIds: [] as string[], consensus: { kind: 'pow' as const, workUnits: 1 as const, discoveryId: hash(['pow-genesis-v1']) } };
        this.genesis = freezeData({ id: blockId(header), header, transactions: [], producerSignature: '' }); this.catalog.set(this.genesis.id, this.genesis);
        this.domain = hash(['pow-domain-v1', this.config, this.accounts, [...this.accountKeys], this.genesis.id]);
        this.windowEndMs = scenario.maxDurationMs;
        for (const node of validators) {
            const view = { nodeId: node.id, nowMs: 0, config: this.config, domain: this.domain, genesisId: this.genesis.id,
                blocks: new Map([[this.genesis.id, this.genesis]]), headId: this.genesis.id, mempool: [],
                strategy: { privateMining: scenario.privateAttack?.minerId === node.id, startAtMs: scenario.privateAttack?.startAtMs, releaseAtMs: scenario.privateAttack?.releaseAtMs } };
            this.nodes.set(node.id, { id: node.id, blocks: new Map(view.blocks), headId: view.headId, ledger: this.genesisLedger,
                transactions: new Map(), state: this.adapter.init(view).nextProtocolState });
        }
    }
    private validateScenario(s: PowScenario) {
        const validId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
        const allowed = ['id', 'seed', 'powers', 'nodeIds', 'meanBlockTimeMs', 'confirmations', 'maxDurationMs', 'blockCapacity', 'minLatencyMs', 'maxLatencyMs',
            'offline', 'partitions', 'transactionPlan', 'accounts', 'observerNodeId', 'entryNodeId', 'stopAfterBlocks', 'privateAttack', 'merchant'];
        if (!s || Object.keys(s).some(key => !allowed.includes(key)) || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(s.id)
            || typeof s.seed !== 'string' || !s.seed || s.seed.length > 128 || !Array.isArray(s.nodeIds) || !integer(s.nodeIds.length, 1, 64)
            || !s.nodeIds.every(validId) || new Set(s.nodeIds).size !== s.nodeIds.length || !Array.isArray(s.powers) || s.powers.length !== s.nodeIds.length
            || s.powers.some(n => !integer(n, 0, 1000000000)) || !integer(s.powers.reduce((a, b) => a + b, 0), 1, 1000000000)
            || !integer(s.meanBlockTimeMs, 100, 1000000) || !integer(s.confirmations, 1, 100) || !integer(s.maxDurationMs, 1, 800000000)
            || !integer(s.blockCapacity, 1, 100) || !integer(s.minLatencyMs, 0, 100000) || !integer(s.maxLatencyMs, s.minLatencyMs, 100000)
            || (s.stopAfterBlocks !== undefined && !integer(s.stopAfterBlocks, 1, 100)) || !Array.isArray(s.offline) || s.offline.some(id => !s.nodeIds.includes(id))
            || !s.nodeIds.includes(s.observerNodeId) || !s.nodeIds.includes(s.entryNodeId)) throw new Error('POW_CONFIG_INVALID');
        if (!Array.isArray(s.accounts) || !integer(s.accounts.length, 2, 100) || new Set(s.accounts.map(a => a.id)).size !== s.accounts.length
            || s.accounts.some(a => !validId(a.id) || typeof a.name !== 'string' || a.name.length > 64 || !integer(a.initialBalance, 0, 1000000000))) throw new Error('POW_ACCOUNTS_INVALID');
        if (!Array.isArray(s.transactionPlan) || s.transactionPlan.length > 1000 || s.transactionPlan.some(tx => !s.accounts.some(a => a.id === tx.from)
            || !s.accounts.some(a => a.id === tx.to) || !s.nodeIds.includes(tx.entryNodeId) || !integer(tx.amount, 1) || !integer(tx.nonce) || !integer(tx.atMs, 0, s.maxDurationMs))) throw new Error('POW_TX_PLAN_INVALID');
        if (!Array.isArray(s.partitions) || s.partitions.length > 64 || s.partitions.some(p => !integer(p.startMs) || !integer(p.endMs, p.startMs + 1)
            || !Array.isArray(p.groups) || p.groups.some(g => !Array.isArray(g) || g.some(id => !s.nodeIds.includes(id)))
            || new Set(p.groups.flat()).size !== s.nodeIds.length || p.groups.flat().length !== s.nodeIds.length)) throw new Error('POW_PARTITION_INVALID');
        if (s.privateAttack && (!s.nodeIds.includes(s.privateAttack.minerId) || !integer(s.privateAttack.releaseAtMs, 1, s.maxDurationMs)
            || (s.privateAttack.excludedTransactionIndex !== undefined && !integer(s.privateAttack.excludedTransactionIndex, 0, s.transactionPlan.length - 1)))) throw new Error('POW_ATTACK_INVALID');
        if (s.merchant && (!s.nodeIds.includes(s.merchant.nodeId) || !integer(s.merchant.confirmations, 1, 100)
            || !integer(s.merchant.transactionIndex, 0, s.transactionPlan.length - 1) || !integer(s.merchant.conflictingIndex, 0, s.transactionPlan.length - 1))) throw new Error('POW_MERCHANT_INVALID');
        if (s.merchant) {
            const a = s.transactionPlan[s.merchant.transactionIndex], b = s.transactionPlan[s.merchant.conflictingIndex];
            if (a.from !== b.from || a.nonce !== b.nonce || a.to === b.to) throw new Error('POW_MERCHANT_CONFLICT_REQUIRED');
        }
    }
    view(id: string): PowView {
        const n = this.nodes.get(id)!;
        return { nodeId: id, nowMs: this.nowMs, config: this.config, domain: this.domain, genesisId: this.genesis.id, blocks: new Map(n.blocks), headId: n.headId,
            mempool: [...n.transactions.values()].filter(tx => tx.nonce >= (n.ledger.get(tx.from)?.nextNonce ?? 0)),
            strategy: { privateMining: this.scenario.privateAttack?.minerId === id, startAtMs: this.scenario.privateAttack?.startAtMs, releaseAtMs: this.scenario.privateAttack?.releaseAtMs } };
    }
    context(id: string): PowContext {
        return { sign: payload => this.sign(id, payload), verify: m => verifyPowMessage(m, this.config, this.domain),
            verifyTransaction: tx => verifyTransactionEnvelope(tx, this.accountKeys), verifyBlock: (b, known, time) => this.verifyBlock(b, known, time),
            discovery: timer => timer === 'discovery' ? this.activeDiscovery.get(id) : undefined };
    }
    sign(id: string, payload: PowPayload): PowMessage {
        const key = powMessageId(this.domain, id, payload);
        return freezeData({ protocolVersion: 1, protocol: 'pow', domain: this.domain, signerId: id, payload, id: key, signature: signId(key, this.keys.get(id)!) });
    }
    transaction(from: string, to: string, amount: number, nonce: number): Transaction {
        if (!this.accountKeys.has(from) || !this.accountKeys.has(to)) throw new Error('ACCOUNT_UNKNOWN');
        const data = { from, to, amount, nonce }, id = txId(data);
        return freezeData({ version: 1, ...data, id, signature: signId(id, demoIdentity(`account-${from}`).privateKey) });
    }
    submitTransaction(tx: Transaction, entryNodeId: string, atMs = 0) {
        if (this.finished || !this.nodes.has(entryNodeId) || !integer(atMs, this.nowMs, this.scenario.maxDurationMs)) throw new Error('TX_SCHEDULE_INVALID');
        const saved = freezeData(structuredClone(tx)); this.transactions.push(saved);
        this.schedule({ kind: 'tx', nodeId: entryNodeId, tx: saved }, atMs);
    }
    private schedule(event: any, atMs: number) { this.queue.push({ ...event, atMs, seq: ++this.seq }); }
    private observe(nodeId: string | null, type: string, payload: Record<string, unknown>) {
        this.observations.push({ schemaVersion: 1, runId: this.scenario.id, eventSeq: this.observations.length + 1, simTimeMs: this.nowMs, nodeId, type, payload });
    }
    private blocked(from: string, to: string, time: number) {
        return this.scenario.partitions.some(p => time >= p.startMs && time < p.endMs && !p.groups.some(g => g.includes(from) && g.includes(to)));
    }
    private send(from: string, to: string, message: PowMessage) {
        if (!this.nodes.has(to) || message.signerId !== from || !verifyPowMessage(message, this.config, this.domain)) throw new Error('POW_EFFECT_INVALID');
        this.messages.set(message.id, message);
        const transportId = hash(['pow-transport', ++this.networkCounter, message.id, from, to]);
        this.observe(from, 'MESSAGE_SENT', { messageId: transportId, contentId: message.id, from, to, messageType: message.payload.kind });
        if (this.scenario.offline.includes(to) || this.blocked(from, to, this.nowMs)) {
            this.observe(to, 'MESSAGE_DROPPED', { messageId: transportId, contentId: message.id, from, to, messageType: message.payload.kind, reason: 'Hors ligne ou partition à l’envoi.' }); return;
        }
        const width = this.scenario.maxLatencyMs - this.scenario.minLatencyMs + 1;
        const latency = this.scenario.minLatencyMs + Number(BigInt('0x' + hash(['pow-network', this.config.seed, this.networkCounter]).slice(0, 12)) % BigInt(width));
        this.schedule({ kind: 'deliver', nodeId: to, from, message, sentAtMs: this.nowMs, transportId }, this.nowMs + latency);
    }
    verifyBlock(b: Block, known: ReadonlyMap<string, Block>, nowMs: number): boolean {
        try {
            if (!isPowBlock(b)) return false;
            const h = b.header, c = h.consensus; if (c.kind !== 'pow') return false;
            const parent = known.get(h.parentId!), miner = this.config.validators.find(n => n.id === h.producerId), proof = this.proofs.get(c.discoveryId);
            if (!parent || !miner || miner.hashPower <= 0 || !proof || proof.blockId !== b.id || proof.minerId !== h.producerId
                || proof.discoveredAtMs !== h.proposedAtMs || proof.workUnits !== 1 || h.proposedAtMs > nowMs || h.proposedAtMs <= parent.header.proposedAtMs
                || h.height !== parent.header.height + 1 || b.id !== blockId(h) || !verifyId(b.id, b.producerSignature, miner.publicKey)
                || b.transactions.length > this.config.blockCapacity || h.txIds.length !== b.transactions.length || h.txIds.some((id, i) => id !== b.transactions[i].id)) return false;
            applyTransactions(ledgerAt(parent.id, known, this.genesisLedger, this.accountKeys), b.transactions, this.accountKeys); return true;
        } catch { return false; }
    }
    private input(id: string, input: PowInput) {
        const node = this.nodes.get(id)!;
        if (this.scenario.offline.includes(id)) return;
        if (input.kind === 'message' && !verifyPowMessage(input.message, this.config, this.domain)) {
            this.observe(id, 'MESSAGE_REJECTED_LOCAL', { reason: 'Signature, domaine ou schéma PoW invalide.' }); return;
        }
        const previousPending = node.state.pending.size;
        const decision = this.adapter.onInput(this.view(id), node.state, input, this.context(id)); node.state = decision.nextProtocolState;
        this.applyEffects(id, decision.effects);
        if (previousPending !== node.state.pending.size) this.observe(id, 'PENDING_MESSAGES_CHANGED', { count: node.state.pending.size });
    }
    deliver(to: string, from: string, message: PowMessage) { this.input(to, { kind: 'message', from, message }); }
    private applyEffects(id: string, effects: PowEffect[]) {
        const n = this.nodes.get(id)!;
        for (const effect of effects) {
            switch (effect.kind) {
                case 'send': this.send(id, effect.to, effect.message); break;
                case 'armTimer':
                    if (!integer(effect.atMs, this.nowMs + 1)) throw new Error('POW_TIMER_INVALID');
                    this.schedule({ kind: 'timer', nodeId: id, timerId: effect.timerId, generation: effect.generation }, effect.atMs); break;
                case 'acceptTransaction':
                    if (!verifyTransactionEnvelope(effect.transaction, this.accountKeys)) throw new Error('TX_INVALID');
                    n.transactions.set(effect.transaction.id, effect.transaction); this.observe(id, 'TX_ACCEPTED_LOCAL', { txId: effect.transaction.id }); break;
                case 'acceptBlock': {
                    const b = effect.block; if (!this.verifyBlock(b, n.blocks, this.nowMs)) throw new Error('POW_BLOCK_EFFECT_INVALID');
                    n.blocks.set(b.id, b); for (const tx of b.transactions) n.transactions.set(tx.id, tx);
                    this.observe(id, 'BLOCK_ACCEPTED_LOCAL', { blockId: b.id, parentId: b.header.parentId, height: b.header.height }); break;
                }
                case 'rejectBlock': this.observe(id, 'BLOCK_REJECTED_LOCAL', { blockId: effect.blockId, reason: effect.reason }); break;
                case 'setHead': {
                    const before = this.branch(n.headId, n.blocks), after = this.branch(effect.blockId, n.blocks), afterIds = new Set(after.map(b => b.id)), beforeIds = new Set(before.map(b => b.id));
                    if (choosePowHead(n.blocks, n.headId) !== effect.blockId) throw new Error('POW_HEAD_EFFECT_INVALID');
                    const removed = before.filter(b => !afterIds.has(b.id)), added = after.filter(b => !beforeIds.has(b.id));
                    const oldHead = n.headId; n.headId = effect.blockId; n.ledger = ledgerAt(n.headId, n.blocks, this.genesisLedger, this.accountKeys);
                    this.observe(id, 'HEAD_CHANGED', { oldHeadId: oldHead, newHeadId: n.headId, commonAncestorId: before.filter(b => afterIds.has(b.id)).at(-1)!.id,
                        removedBlockIds: removed.map(b => b.id), addedBlockIds: added.map(b => b.id), cumulativeWork: cumulativeWork(n.blocks, n.headId) });
                    if (removed.length) this.observe(id, 'CHAIN_REORGANIZED', { removedBlockIds: removed.map(b => b.id), addedBlockIds: added.map(b => b.id) });
                    this.updateConfirmations(id); break;
                }
                case 'release': this.observe(id, 'PRIVATE_CHAIN_RELEASED', { blockIds: effect.blockIds, count: effect.blockIds.length }); break;
            }
        }
    }
    branch(head: string, known: ReadonlyMap<string, Block>) {
        const result: Block[] = []; for (let b = known.get(head); b; b = b.header.parentId ? known.get(b.header.parentId) : undefined) result.push(b);
        return result.reverse();
    }
    private updateConfirmations(id: string) {
        const n = this.nodes.get(id)!, branch = this.branch(n.headId, n.blocks), height = branch.at(-1)!.header.height;
        for (const tx of this.transactions) {
            const included = branch.find(b => b.transactions.some(t => t.id === tx.id)), key = `${id}:${tx.id}`;
            const count = included ? height - included.header.height + 1 : 0;
            if (count >= this.config.confirmations && !this.confirmationsAt.has(key)) {
                this.confirmationsAt.set(key, this.nowMs); this.observe(id, 'TX_CONFIRMED_LOCAL', { txId: tx.id, blockId: included!.id, confirmations: count, threshold: this.config.confirmations });
            } else if (count < this.config.confirmations && this.confirmationsAt.has(key)) {
                this.confirmationsAt.delete(key); this.observe(id, 'TX_CONFIRMATION_REVOKED', { txId: tx.id, confirmations: count });
            }
        }
        const m = this.scenario.merchant;
        if (m?.nodeId !== id) return;
        const paid = this.transactions[m.transactionIndex], conflicting = this.transactions[m.conflictingIndex];
        const included = branch.find(b => b.transactions.some(t => t.id === paid.id));
        if (!this.merchantState.delivered && included && height - included.header.height + 1 >= m.confirmations) {
            this.merchantState.delivered = true; this.merchantState.acceptedAtMs = this.nowMs;
            this.observe(id, 'MERCHANT_ACCEPTED', { txId: paid.id, confirmations: height - included.header.height + 1, delivered: true });
        }
        const conflictBlock = branch.find(b => b.transactions.some(tx => tx.id === conflicting.id));
        if (this.merchantState.delivered && !included && conflictBlock && height - conflictBlock.header.height + 1 >= m.confirmations && !this.merchantState.doubleSpendObserved) {
            this.merchantState.doubleSpendObserved = true; this.observe(id, 'DOUBLE_SPEND_OBSERVED', { txId: paid.id, conflictingTxId: conflicting.id, delivered: true });
        }
    }
    private discover(id: string, count: number) {
        const n = this.nodes.get(id)!, privateMining = !n.state.released;
        const parentId = privateMining ? n.state.privateHeadId : n.headId, parent = n.blocks.get(parentId)!;
        const excluded = privateMining && this.scenario.privateAttack?.excludedTransactionIndex !== undefined
            ? this.transactions[this.scenario.privateAttack.excludedTransactionIndex]?.id : undefined;
        // Le parent privé peut avoir d'autres nonces que la tête publique : sélectionner
        // dans les paiements locaux complets, puis les exécuter sur le registre de CE parent.
        const candidates = [...n.transactions.values()].filter(tx => tx.id !== excluded);
        const txs = selectTransactions(ledgerAt(parentId, n.blocks, this.genesisLedger, this.accountKeys), candidates, this.config.blockCapacity, this.accountKeys);
        const proofId = hash(['pow-discovery-v1', this.domain, id, count, this.nowMs]);
        const block = freezeData(makeBlock({ protocolVersion: 1, protocol: 'pow', parentId, height: parent.header.height + 1, producerId: id,
            proposedAtMs: this.nowMs, txIds: txs.map(tx => tx.id), consensus: { kind: 'pow', workUnits: 1, discoveryId: proofId } }, txs, this.keys.get(id)!));
        this.proofs.set(proofId, freezeData({ id: proofId, minerId: id, discoveredAtMs: this.nowMs, workUnits: 1, blockId: block.id }));
        this.catalog.set(block.id, block); this.discoveryCounts.set(id, (this.discoveryCounts.get(id) ?? 0) + 1);
        this.observe(id, 'MINING_DISCOVERY', { discoveryId: proofId, blockId: block.id, workUnits: 1, private: privateMining });
        this.observe(id, 'BLOCK_PROPOSED', { blockId: block.id, parentId, height: block.header.height, private: privateMining });
        this.activeDiscovery.set(id, block); this.input(id, { kind: 'timer', timerId: 'discovery', generation: 1 }); this.activeDiscovery.delete(id);
        this.schedule({ kind: 'discover', nodeId: id, count: count + 1 }, this.nowMs + discoveryDelay(this.config, id, count + 1));
    }
    step(): boolean {
        if (this.finished) return false;
        if (!this.started) {
            this.started = true; this.observe(null, 'RUN_STATUS_CHANGED', { status: 'running' });
            for (const node of this.config.validators) if (!this.scenario.offline.includes(node.id)) {
                if (node.hashPower > 0) this.schedule({ kind: 'discover', nodeId: node.id, count: 0 }, discoveryDelay(this.config, node.id, 0));
                this.applyEffects(node.id, this.adapter.init(this.view(node.id)).effects);
            }
        }
        const next = this.queue.peek();
        if (!next || next.atMs > this.windowEndMs) {
            this.nowMs = this.windowEndMs; this.finished = true; this.queue.clear();
            this.observe(null, 'RUN_STATUS_CHANGED', { status: 'finished', reason: this.targetReached ? 'BLOCK_TARGET_REACHED' : 'MAX_DURATION' }); return false;
        }
        const e = this.queue.shift()!; this.nowMs = e.atMs;
        if (e.kind === 'tx') {
            this.observe(null, 'TX_SUBMITTED', { txId: e.tx.id, entryNodeId: e.nodeId });
            if (!verifyTransactionEnvelope(e.tx, this.accountKeys)) this.observe(e.nodeId, 'TX_REJECTED_LOCAL', { txId: e.tx.id, reason: 'Signature ou format invalide.' });
            else this.input(e.nodeId, { kind: 'transactionAvailable', transaction: e.tx });
        } else if (!this.scenario.offline.includes(e.nodeId)) {
            if (e.kind === 'discover') { if (!this.targetReached) this.discover(e.nodeId, e.count); }
            else if (e.kind === 'timer') this.input(e.nodeId, e);
            else if (this.blocked(e.from, e.nodeId, this.nowMs)) this.observe(e.nodeId, 'MESSAGE_DROPPED', { messageId: e.transportId, contentId: e.message.id, from: e.from, to: e.nodeId, messageType: e.message.payload.kind, reason: 'Partition à la livraison.' });
            else {
                this.observe(e.nodeId, 'MESSAGE_DELIVERED', { messageId: e.transportId, contentId: e.message.id, from: e.from, to: e.nodeId, messageType: e.message.payload.kind, sentAtMs: e.sentAtMs });
                this.input(e.nodeId, { kind: 'message', from: e.from, message: e.message });
            }
        }
        const reference = this.nodes.get(this.scenario.observerNodeId)!;
        if (!this.targetReached && this.scenario.stopAfterBlocks && reference.blocks.get(reference.headId)!.header.height >= this.scenario.stopAfterBlocks) {
            this.targetReached = true;
            // Arrêt des découvertes, puis fenêtre bornée de propagation ; aucune finalité n'est fabriquée à l'arrêt.
            this.windowEndMs = Math.min(this.windowEndMs, this.nowMs + Math.max(100, this.scenario.maxLatencyMs * 4));
        }
        return true;
    }
    run(limit = 100000) { for (let count = 0; this.step(); count++) if (count >= limit) throw new Error('POW_EVENT_LIMIT'); return this; }
    export() {
        return { modelVersion: 'pow-guide-v3.0.0', protocol: 'pow', scenario: this.scenario, config: this.config, domain: this.domain, durationMs: this.windowEndMs,
            observations: this.observations, messages: [...this.messages.values()], blocks: [...this.catalog.values()], simulatedWorkProofs: [...this.proofs.values()],
            transactions: this.transactions, accounts: this.accounts, merchant: this.scenario.merchant ? { ...this.merchantState } : null,
            nodes: [...this.nodes.values()].map(n => ({ id: n.id, headId: n.headId, height: n.blocks.get(n.headId)!.header.height, work: cumulativeWork(n.blocks, n.headId),
                ledger: Object.fromEntries(n.ledger), knownBlocks: [...n.blocks.keys()], pending: n.state.pending.size })),
            limits: ['Découvertes exponentielles simulées, difficulté fixe : une unité par bloc.', 'Aucun vote, récompense ou finalité déterministe.', 'Le seuil k est une politique d’acceptation réversible.'] };
    }
}
