import { Random } from '../../core/primitives.js';
import { descends } from '../../core/ledger.js';
import type { Checkpoint, ConsensusModule, LinkVote, ModuleContext } from '../../core/types.js';
const cpkey = (c: Checkpoint) => c.epoch + ':' + c.block;
function proposer(ctx: ModuleContext, slot: number) { const r = new Random((ctx.config.seed ^ Math.imul(slot + 1, 2654435761)) >>> 0).next(); let x = r * ctx.ids.reduce((sum, id) => sum + ctx.weight(id), 0); for (const id of ctx.ids) {
    x -= ctx.weight(id);
    if (x < 0)
        return id;
} return ctx.ids.at(-1)!; }
function forkChoice(ctx: ModuleContext) {
    const n = ctx.node;
    let root = n.justified.block;
    if (!descends(n.blocks, root, n.finalized.block))
        root = n.finalized.block;
    let again = true;
    while (again) {
        again = false;
        const children = [...n.blocks.values()].filter(b => b.parent === root);
        if (children.length) {
            const weights = children.map(b => ({ b, weight: [...n.headVotes].reduce((sum, [id, v]) => sum + (descends(n.blocks, v.block, b.id) ? ctx.weight(id) : 0), 0) }));
            weights.sort((a, b) => b.weight - a.weight || a.b.id.localeCompare(b.b.id));
            root = weights[0].b.id;
            again = true;
        }
    }
    ctx.adopt(root);
}
function processLinks(ctx: ModuleContext) {
    const n = ctx.node, total = ctx.ids.reduce((s, id) => s + ctx.weight(id), 0);
    let progress = true;
    while (progress) {
        progress = false;
        for (const group of n.linkVotes.values()) {
            const votes = [...group.values()];
            if (!votes.length)
                continue;
            const { source, target } = votes[0];
            if (!n.justifiedSet.has(cpkey(source)) || !n.blocks.has(target.block) || !descends(n.blocks, target.block, source.block))
                continue;
            // Recheck dependencies after late block delivery, not only on initial vote reception.
            const boundary = ctx.config.slotDuration * ctx.config.epochLength;
            if (n.blocks.get(target.block)!.time >= target.epoch * boundary || (source.epoch > 0 && n.blocks.get(source.block)!.time >= source.epoch * boundary)) continue;
            if (votes.reduce((s, v) => s + ctx.weight(v.validator), 0) * 3 < total * 2)
                continue;
            if (!n.justifiedSet.has(cpkey(target))) {
                n.justifiedSet.set(cpkey(target), target);
                progress = true;
                ctx.observe('CHECKPOINT_JUSTIFIED', { epoch: target.epoch, block: target.block, votes: votes.length });
            }
            if (source.epoch + 1 === target.epoch && source.epoch > n.finalized.epoch) {
                if (!descends(n.blocks, source.block, n.finalized.block)) {
                    ctx.observe('SAFETY_VIOLATION', { kind: 'conflicting-finality' });
                    continue;
                }
                n.finalized = source;
                ctx.observe('CHECKPOINT_FINALIZED', { epoch: source.epoch, block: source.block, votes: votes.length });
            }
        }
    }
    for (const cp of n.justifiedSet.values())
        if (cp.epoch > n.justified.epoch && descends(n.blocks, cp.block, n.finalized.block))
            n.justified = cp;
    forkChoice(ctx);
}
function receiveLink(ctx: ModuleContext, v: LinkVote) {
    const n = ctx.node;
    if (!v || !ctx.ids.includes(v.validator) || !v.source || !v.target || !Number.isSafeInteger(v.source.epoch) || !Number.isSafeInteger(v.target.epoch) || v.source.epoch < 0 || v.target.epoch <= v.source.epoch || v.target.epoch > Math.floor(ctx.now / (ctx.config.slotDuration * ctx.config.epochLength)))
        return;
    const data = { source: v.source, target: v.target, validator: v.validator };
    if (!ctx.verify(v.validator, data, v.signature))
        return;
    const history = n.votesHistory.get(v.validator) ?? [];
    for (const old of history) {
        if ((old.target.epoch === v.target.epoch && (cpkey(old.target) !== cpkey(v.target) || cpkey(old.source) !== cpkey(v.source))) || (old.source.epoch < v.source.epoch && v.target.epoch < old.target.epoch) || (v.source.epoch < old.source.epoch && old.target.epoch < v.target.epoch))
            ctx.observe('FAULT_EVIDENCE', { offender: v.validator, kind: 'incompatible-votes', epoch: v.target.epoch });
    }
    if (!history.some(h => h.signature === v.signature))
        history.push(v);
    n.votesHistory.set(v.validator, history);
    const block = n.blocks.get(v.target.block);
    if (block && block.time >= v.target.epoch * ctx.config.epochLength * ctx.config.slotDuration)
        return;
    const k = cpkey(v.source) + '>' + cpkey(v.target);
    const group = n.linkVotes.get(k) ?? new Map();
    group.set(v.validator, v);
    n.linkVotes.set(k, group);
    processLinks(ctx);
}
function slot(ctx: ModuleContext) {
    const n = ctx.node, c = ctx.config, s = Math.floor(ctx.now / c.slotDuration), epoch = Math.floor(s / c.epochLength);
    forkChoice(ctx);
    if (s % c.epochLength === 0 && epoch > 0 && !n.votedEpochs.has(epoch) && !(n.faulty && ctx.now >= c.attackStart)) {
        let block = n.blocks.get(n.head)!;
        while (block.time >= ctx.now && block.parent)
            block = n.blocks.get(block.parent)!;
        const target = { epoch, block: block.id };
        let source = n.justified;
        if (!descends(n.blocks, target.block, source.block))
            source = n.finalized;
        if (source.epoch < epoch) {
            const data = { source, target, validator: n.id };
            ctx.broadcast('LINK_VOTE', { ...data, signature: ctx.sign(data) });
            n.votedEpochs.add(epoch);
        }
    }
    if (proposer(ctx, s) === n.id) {
        const b = ctx.propose(undefined, s);
        ctx.accept(b);
        ctx.adopt(b.id);
        if (n.faulty && ctx.now >= c.attackStart) {
            const alternative = ctx.propose(b.txs.slice(1), s, b.parent!);
            ctx.accept(alternative);
            ctx.ids.forEach((id, i) => ctx.send(id, 'BLOCK', i % 2 ? b : alternative));
        }
        else
            ctx.broadcast('BLOCK', b);
    }
    ctx.after('attest', c.slotDuration / 2, { slot: s });
    ctx.after('slot', c.slotDuration);
}
export const pos: ConsensusModule = {
    init(ctx) { slot(ctx); },
    timer(ctx, name, data) {
        if (name === 'slot')
            slot(ctx);
        if (name === 'attest' && !(ctx.node.faulty && ctx.now >= ctx.config.attackStart)) {
            forkChoice(ctx);
            ctx.broadcast('HEAD_VOTE', { slot: data.slot, block: ctx.node.head });
        }
        if (name === 'sync')
            processLinks(ctx);
    },
    message(ctx, m) {
        const n = ctx.node;
        if (!m?.body || typeof m.body !== 'object') return;
        if (m.type === 'BLOCK') {
            const b = m.body;
            for (const other of n.blocks.values())
                if (other.id !== b.id && other.producer === b.producer && other.slot === b.slot && other.height > 0)
                    ctx.observe('FAULT_EVIDENCE', { offender: b.producer, kind: 'double-proposal', slot: b.slot });
            processLinks(ctx);
        }
        if (m.type === 'HEAD_VOTE') {
            const { slot, block } = m.body;
            if (!Number.isSafeInteger(slot) || slot < 0 || slot > Math.floor(ctx.now / ctx.config.slotDuration) || typeof block !== 'string')
                return;
            const old = n.headVotes.get(m.from);
            if (!old || slot > old.slot)
                n.headVotes.set(m.from, { slot, block });
            else if (old.slot === slot && old.block !== block)
                ctx.observe('FAULT_EVIDENCE', { offender: m.from, kind: 'double-head-vote', slot });
            if (!n.blocks.has(block))
                ctx.send(m.from, 'GET_BLOCK', { id: block });
            forkChoice(ctx);
        }
        if (m.type === 'LINK_VOTE' && m.body.validator === m.from)
            receiveLink(ctx, m.body);
    }
};
