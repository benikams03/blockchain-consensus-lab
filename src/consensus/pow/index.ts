import type { ConsensusModule, ModuleContext } from '../../core/types.js';
function schedule(ctx: ModuleContext) { const total = 100; const rate = ctx.node.power / total; const u = Math.max(1e-12, ctx.random()); ctx.after('mine', -Math.log(u) * ctx.config.blockInterval / rate); }
function choose(ctx: ModuleContext) { const n = ctx.node; let best = n.blocks.get(n.head)!; for (const b of n.blocks.values()) {
    if (n.privateBlocks.includes(b.id) && !n.released)
        continue;
    if (b.work > best.work)
        best = b;
} ctx.adopt(best.id); }
export const pow: ConsensusModule = {
    init(ctx) { schedule(ctx); if (ctx.node.faulty) {
        ctx.after('anchor', ctx.config.attackStart);
        ctx.after('release', ctx.config.releaseAt);
    } },
    timer(ctx, name) {
        const n = ctx.node, c = ctx.config;
        if (name === 'anchor') {
            n.privateHead = n.head;
            return;
        }
        if (name === 'release') {
            n.released = true;
            for (const id of n.privateBlocks)
                ctx.broadcast('BLOCK', n.blocks.get(id));
            choose(ctx);
            ctx.observe('PRIVATE_CHAIN_RELEASED', { blocks: n.privateBlocks.length });
            return;
        }
        if (name !== 'mine')
            return;
        const withholding = n.faulty && !n.released && ctx.now >= c.attackStart;
        const parent = withholding ? (n.privateHead ?? n.head) : n.head;
        const excluded = new Set<string>();
        if (withholding && c.attack === 'double')
            for (const t of n.mempool.values())
                if (t.from === 'mallory' && t.to === 'marchand')
                    excluded.add(t.id);
        if (!withholding && c.attack === 'double')
            for (const t of n.mempool.values())
                if (t.from === 'mallory' && t.to === 'mallory')
                    excluded.add(t.id);
        const b = ctx.propose(ctx.select(parent, excluded), 0, parent);
        ctx.accept(b);
        if (withholding) {
            n.privateHead = b.id;
            n.privateBlocks.push(b.id);
        }
        else {
            ctx.adopt(b.id);
            ctx.broadcast('BLOCK', b);
        }
        schedule(ctx);
    },
    message(ctx, m) { if (m.type === 'BLOCK')
        choose(ctx); }
};
