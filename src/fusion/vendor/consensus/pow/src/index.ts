// Module PoW autonome : le moteur seul simule et authentifie les découvertes de travail.
import type { Block, ConsensusAdapter } from '../../../contracts/src/index.js';
import type { PowConfig, PowContext, PowEffect, PowInput, PowMessage, PowPayload, PowState, PowView } from '../../../contracts/src/pow.js';
import { compareId, hash, integer, verifyId } from '../../../core/src/index.js';
import { isTransaction } from '../../../contracts/src/schema.js';

// Une unité de travail par bloc valide dans V1 ; calcul explicite, sans choisir par hauteur seule.
export function cumulativeWork(blocks: ReadonlyMap<string, Block>, id: string): number {
    let work = 0; const seen = new Set<string>();
    for (let b = blocks.get(id); b; b = b.header.parentId ? blocks.get(b.header.parentId) : undefined) {
        if (seen.has(b.id)) throw new Error('BLOCK_CYCLE'); seen.add(b.id);
        if (b.header.height === 0) return work;
        if (b.header.consensus.kind !== 'pow' || b.header.consensus.workUnits !== 1) throw new Error('WORK_INVALID');
        work += b.header.consensus.workUnits;
    }
    throw new Error('PARENT_UNKNOWN');
}
export function choosePowHead(blocks: ReadonlyMap<string, Block>, current: string): string {
    let bestWork = -1, candidates: string[] = [];
    for (const id of blocks.keys()) {
        const work = cumulativeWork(blocks, id);
        if (work > bestWork) { bestWork = work; candidates = [id]; }
        else if (work === bestWork) candidates.push(id);
    }
    // Une égalité n'entraîne pas une réorganisation gratuite. Nouveaux candidats : plus petit id.
    return candidates.includes(current) ? current : candidates.sort(compareId)[0];
}
export function powMessageId(domain: string, signerId: string, payload: PowPayload): string {
    return hash(['pow-message', 1, domain, signerId, payload.kind,
        payload.kind === 'transaction' ? payload.transaction.id : payload.kind === 'requestBlock' ? payload.blockId : payload.block.id]);
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, any>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const digest = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export function isPowBlock(value: unknown): value is Block {
    if (!object(value) || !exact(value, ['id', 'header', 'transactions', 'producerSignature']) || !digest(value.id)
        || !object(value.header) || !Array.isArray(value.transactions) || value.transactions.length > 100 || !value.transactions.every(isTransaction)) return false;
    const h = value.header, c = h.consensus;
    return exact(h, ['protocolVersion', 'protocol', 'parentId', 'height', 'producerId', 'proposedAtMs', 'txIds', 'consensus'])
        && h.protocolVersion === 1 && h.protocol === 'pow' && digest(h.parentId) && integer(h.height, 1)
        && typeof h.producerId === 'string' && integer(h.proposedAtMs) && Array.isArray(h.txIds) && h.txIds.length <= 100 && h.txIds.every(digest)
        && object(c) && exact(c, ['kind', 'workUnits', 'discoveryId']) && c.kind === 'pow' && c.workUnits === 1 && digest(c.discoveryId);
}
export function verifyPowMessage(m: PowMessage, config: PowConfig, domain: string): boolean {
    try {
        if (!object(m) || !exact(m, ['protocolVersion', 'protocol', 'domain', 'signerId', 'payload', 'id', 'signature'])
            || m.protocolVersion !== 1 || m.protocol !== 'pow' || m.domain !== domain || !object(m.payload)) return false;
        const p = m.payload;
        if (!(p.kind === 'transaction' ? exact(p, ['kind', 'transaction']) && isTransaction(p.transaction)
            : p.kind === 'requestBlock' ? exact(p, ['kind', 'blockId']) && digest(p.blockId)
                : ['proposal', 'blockResponse'].includes(p.kind) && exact(p, ['kind', 'block']) && isPowBlock(p.block))) return false;
        const node = config.validators.find(node => node.id === m.signerId);
        return !!node && m.id === powMessageId(domain, m.signerId, p) && verifyId(m.id, m.signature, node.publicKey);
    } catch { return false; }
}
// Tirage exponentiel propre au mineur : pas de second tirage de gagnant et pas de boucle de hash.
export function discoveryDelay(config: PowConfig, minerId: string, count: number): number {
    const miner = config.validators.find(node => node.id === minerId), total = config.validators.reduce((sum, node) => sum + node.hashPower, 0);
    if (!miner || miner.hashPower <= 0 || !integer(count)) throw new Error('MINER_INVALID');
    const u = (Number.parseInt(hash([config.discoveryVersion, config.seed, minerId, count]).slice(0, 13), 16) + 0.5) / 4503599627370496;
    return Math.max(1, Math.round(-Math.log1p(-u) * config.meanBlockTimeMs * total / miner.hashPower));
}
export class PowAdapter implements ConsensusAdapter<PowState, PowView, PowInput, PowContext, PowEffect> {
    init(view: PowView) {
        const nextProtocolState: PowState = { knownTransactions: new Set(), pending: new Map(), requests: new Map(), privateHeadId: view.genesisId, privateBlocks: [], released: !view.strategy.privateMining || (view.strategy.startAtMs ?? 0) > 0 };
        const effects: PowEffect[] = [{ kind: 'armTimer', timerId: 'sync', generation: 1, atMs: view.config.meanBlockTimeMs * 2 }];
        if (view.strategy.privateMining) effects.push({ kind: 'armTimer', timerId: 'release', generation: 1, atMs: view.strategy.releaseAtMs! });
        if (view.strategy.privateMining && (view.strategy.startAtMs ?? 0) > 0) effects.push({ kind: 'armTimer', timerId: 'anchor', generation: 1, atMs: view.strategy.startAtMs! });
        return { nextProtocolState, effects };
    }
    onInput(view: PowView, old: Readonly<PowState>, input: PowInput, ctx: PowContext) {
        const s: PowState = { ...old, knownTransactions: new Set(old.knownTransactions), pending: new Map(old.pending), requests: new Map(old.requests), privateBlocks: [...old.privateBlocks] };
        const blocks = new Map(view.blocks), effects: PowEffect[] = [];
        const broadcast = (payload: PowPayload) => { const message = ctx.sign(payload); for (const n of view.config.validators) if (n.id !== view.nodeId) effects.push({ kind: 'send', to: n.id, message }); };
        const receive = (m: PowMessage, from: string) => {
            if (!ctx.verify(m) || !view.config.validators.some(n => n.id === from)) return;
            const p = m.payload;
            if (p.kind === 'transaction') {
                if (s.knownTransactions.has(p.transaction.id) || !ctx.verifyTransaction(p.transaction)) return;
                s.knownTransactions.add(p.transaction.id); effects.push({ kind: 'acceptTransaction', transaction: p.transaction });
                if (s.released) broadcast(p); return;
            }
            if (p.kind === 'requestBlock') {
                const b = blocks.get(p.blockId);
                if (b && (s.released || !s.privateBlocks.includes(b.id))) effects.push({ kind: 'send', to: from, message: ctx.sign({ kind: 'blockResponse', block: b }) });
                return;
            }
            const b = p.block;
            if (blocks.has(b.id)) { s.pending.delete(m.id); return; }
            if (!blocks.has(b.header.parentId!)) {
                s.pending.set(m.id, { message: m, from }); const key = `${from}:${b.header.parentId}`;
                if (from !== view.nodeId && view.nowMs - (s.requests.get(key) ?? -Infinity) >= view.config.meanBlockTimeMs) {
                    s.requests.set(key, view.nowMs); effects.push({ kind: 'send', to: from, message: ctx.sign({ kind: 'requestBlock', blockId: b.header.parentId! }) });
                }
                return;
            }
            s.pending.delete(m.id);
            if (!ctx.verifyBlock(b, blocks, view.nowMs)) { effects.push({ kind: 'rejectBlock', blockId: b.id, reason: 'Preuve simulée, signature, parent ou paiements invalides.' }); return; }
            blocks.set(b.id, b); effects.push({ kind: 'acceptBlock', block: b });
            if (s.released) broadcast({ kind: 'blockResponse', block: b });
        };
        if (input.kind === 'transactionAvailable') receive(ctx.sign({ kind: 'transaction', transaction: input.transaction }), view.nodeId);
        else if (input.kind === 'message') receive(input.message, input.from);
        else if (input.generation === 1 && input.timerId === 'anchor') { s.released = false; s.privateHeadId = view.headId; }
        else if (input.generation === 1 && input.timerId === 'release' && !s.released) {
            s.released = true; effects.push({ kind: 'release', blockIds: [...s.privateBlocks] });
            for (const id of s.privateBlocks) broadcast({ kind: 'proposal', block: blocks.get(id)! });
            for (const tx of view.mempool) broadcast({ kind: 'transaction', transaction: tx });
        } else if (input.kind === 'timer' && input.generation === 1 && input.timerId === 'sync') {
            if (s.released && view.headId !== view.genesisId) broadcast({ kind: 'blockResponse', block: blocks.get(view.headId)! });
            effects.push({ kind: 'armTimer', timerId: 'sync', generation: 1, atMs: view.nowMs + view.config.meanBlockTimeMs * 2 });
        } else if (input.kind === 'timer' && input.generation === 1) {
            const b = ctx.discovery(input.timerId);
            if (b) {
                if (!s.released) { s.privateHeadId = b.id; s.privateBlocks.push(b.id); }
                receive(ctx.sign({ kind: 'proposal', block: b }), view.nodeId);
            }
        }
        // Un parent livré plus tard débloque les descendants ; ils ne sont pas déclarés invalides avant cela.
        let progress = true;
        while (progress) { const size = blocks.size; for (const pending of [...s.pending.values()]) receive(pending.message, pending.from); progress = blocks.size > size; }
        const head = choosePowHead(blocks, view.headId);
        if (head !== view.headId) effects.push({ kind: 'setHead', blockId: head });
        return { nextProtocolState: s, effects };
    }
}
