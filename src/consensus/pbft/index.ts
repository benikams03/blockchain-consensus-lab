import { descends } from '../../core/ledger.js';
import type { CommitCertificate, ConsensusModule, Message, ModuleContext, PreparedCertificate, ViewChange } from '../../core/types.js';
const leader = (ctx: ModuleContext, view: number) => ctx.ids[view % ctx.ids.length];
const f = (ctx: ModuleContext) => (ctx.ids.length - 1) / 3;
const member = (ctx: ModuleContext, id: string) => ctx.ids.includes(id);
const key = (view: number, sequence: number, digest: string) => `${view}:${sequence}:${digest}`;
function messageFits(m: Message, type: string, view: number, sequence: number, digest: string, ctx: ModuleContext) { return m && member(ctx, m.from) && m.type === type && m.body?.view === view && m.body?.sequence === sequence && m.body?.digest === digest && ctx.verifyMessage(m); }
function validPrepared(cert: PreparedCertificate, ctx: ModuleContext, sequence: number): boolean {
    if (!cert?.proposal || !Array.isArray(cert.prepares))
        return false;
    const p = cert.proposal, b = p.body;
    if (p.type !== 'PRE_PREPARE' || b?.sequence !== sequence || p.from !== leader(ctx, b.view) || !ctx.verifyMessage(p) || !b.block || b.block.height !== sequence)
        return false;
    const votes = cert.prepares.filter(m => m.from !== p.from && messageFits(m, 'PREPARE', b.view, sequence, b.block.id, ctx));
    return votes.length === cert.prepares.length && new Set(votes.map(m => m.from)).size === votes.length && votes.length >= 2 * f(ctx);
}
function validCommit(cert: CommitCertificate, ctx: ModuleContext): boolean {
    if (!cert?.block || !Array.isArray(cert.commits) || cert.sequence !== cert.block.height || !Number.isSafeInteger(cert.view) || cert.view < 0)
        return false;
    const votes = cert.commits.filter(m => messageFits(m, 'COMMIT', cert.view, cert.sequence, cert.block.id, ctx));
    return votes.length === cert.commits.length && new Set(votes.map(m => m.from)).size === votes.length && votes.length >= 2 * f(ctx) + 1;
}
function timeout(ctx: ModuleContext) { ctx.after('timeout', (2200 + ctx.config.latencyMax * 5) * Math.min(8, 1 + ctx.node.pbft.requestedView), { sequence: ctx.node.pbft.sequence, view: ctx.node.pbft.requestedView }); }
function installCommit(ctx: ModuleContext, cert: CommitCertificate) {
    const n = ctx.node, s = n.pbft;
    if (!validCommit(cert, ctx))
        return;
    if (!ctx.accept(cert.block)) {
        if (!s.pending.some(c => c.block.id === cert.block.id))
            s.pending.push(cert);
        return;
    }
    if (cert.block.height <= n.blocks.get(n.head)!.height) {
        if (!descends(n.blocks, n.head, cert.block.id))
            ctx.observe('SAFETY_VIOLATION', { kind: 'conflicting-commit' });
        return;
    }
    if (cert.block.parent !== n.head) {
        ctx.send(cert.commits[0].from, 'GET_BLOCK', { id: cert.block.parent });
        if (!s.pending.some(c => c.block.id === cert.block.id))
            s.pending.push(cert);
        return;
    }
    if (!ctx.adopt(cert.block.id))
        return;
    n.finalized = { epoch: cert.sequence, block: cert.block.id };
    n.justified = n.finalized;
    s.certificates.set(cert.block.id, cert);
    s.view = Math.max(s.view, cert.view);
    s.sequence = cert.sequence + 1;
    s.requestedView = s.view;
    s.prepared = null;
    ctx.observe('BLOCK_COMMITTED_LOCAL', { block: cert.block.id, view: cert.view, sequence: cert.sequence, votes: new Set(cert.commits.map(m => m.from)).size });
    if (!member(ctx, n.id)) return;
    timeout(ctx);
    ctx.after('propose', 900, { sequence: s.sequence });
    ctx.broadcast('COMMITTED', cert);
}
function reconcile(ctx: ModuleContext, k: string) {
    const s = ctx.node.pbft, p = s.proposals.get(k);
    if (!p)
        return;
    const b = p.body;
    if (b.sequence !== s.sequence || b.view !== s.view || s.requestedView > s.view)
        return;
    const prepares = [...(s.prepares.get(k)?.values() ?? [])].filter(m => m.from !== leader(ctx, b.view));
    if (prepares.length >= 2 * f(ctx)) {
        s.prepared = { proposal: p, prepares };
        if (!s.sentCommit.has(k)) {
            s.sentCommit.add(k);
            ctx.broadcast('COMMIT', { view: b.view, sequence: b.sequence, digest: b.block.id });
            ctx.observe('PBFT_PHASE', { phase: 'COMMIT', sequence: b.sequence, view: b.view });
        }
        const commits = [...(s.commits.get(k)?.values() ?? [])];
        if (commits.length >= 2 * f(ctx) + 1)
            installCommit(ctx, { block: b.block, view: b.view, sequence: b.sequence, commits });
    }
}
function proposal(ctx: ModuleContext, m: Message) {
    const n = ctx.node, s = n.pbft, b = m.body;
    if (b?.view !== s.view || b.sequence !== s.sequence || s.requestedView > s.view || m.from !== leader(ctx, b.view) || !b.block || b.block.height !== b.sequence || b.block.parent !== n.head || !ctx.accept(b.block))
        return;
    const k = key(b.view, b.sequence, b.block.id);
    const existing = [...s.proposals.values()].find(p => p.body.view === b.view && p.body.sequence === b.sequence);
    if (existing && existing.body.block.id !== b.block.id) {
        ctx.observe('FAULT_EVIDENCE', { offender: m.from, kind: 'conflicting-proposal', view: b.view, sequence: b.sequence });
        return;
    }
    s.proposals.set(k, m);
    if (n.id !== leader(ctx, b.view) && !s.sentPrepare.has(k)) {
        s.sentPrepare.add(k);
        ctx.broadcast('PREPARE', { view: b.view, sequence: b.sequence, digest: b.block.id });
        ctx.observe('PBFT_PHASE', { phase: 'PREPARE', sequence: b.sequence, view: b.view });
    }
    reconcile(ctx, k);
}
function propose(ctx: ModuleContext) {
    const n = ctx.node, s = n.pbft;
    if (n.id !== leader(ctx, s.view) || s.requestedView > s.view || [...s.proposals.values()].some(m => m.body.view === s.view && m.body.sequence === s.sequence))
        return;
    if (n.faulty && ctx.now >= ctx.config.attackStart && ['default', 'silent'].includes(ctx.config.faultBehavior)) {
        ctx.observe('BYZANTINE_SILENCE', { view: s.view });
        return;
    }
    const b = ctx.propose();
    ctx.broadcast('PRE_PREPARE', { view: s.view, sequence: s.sequence, block: b });
    ctx.observe('PBFT_PHASE', { phase: 'PRE-PREPARE', view: s.view, sequence: s.sequence });
}
function change(ctx: ModuleContext, view: number) {
    const n = ctx.node, s = n.pbft, k = `${view}:${s.sequence}`;
    if (view <= s.view || s.sentChanges.has(k))
        return;
    s.requestedView = Math.max(view, s.requestedView);
    s.sentChanges.add(k);
    const body: ViewChange = { view, sequence: s.sequence, head: n.head, prepared: s.prepared };
    ctx.broadcast('VIEW_CHANGE', body);
    ctx.observe('VIEW_CHANGE_REQUESTED', { view, sequence: s.sequence });
    timeout(ctx);
}
function acceptableChange(ctx: ModuleContext, m: Message, view: number, sequence: number, head: string) { const b = m?.body; return m?.type === 'VIEW_CHANGE' && member(ctx, m.from) && ctx.verifyMessage(m) && b.view === view && b.sequence === sequence && b.head === head && (!b.prepared || validPrepared(b.prepared, ctx, sequence)); }
function highest(changes: Message[]) { return changes.map(m => m.body.prepared as PreparedCertificate | null).filter((p): p is PreparedCertificate => !!p).sort((a, b) => b.proposal.body.view - a.proposal.body.view || a.proposal.body.block.id.localeCompare(b.proposal.body.block.id))[0] ?? null; }
function newView(ctx: ModuleContext, m: Message) {
    const n = ctx.node, s = n.pbft, b = m.body;
    if (!b || !Number.isSafeInteger(b.view) || b.view < s.requestedView || b.view <= s.view || m.from !== leader(ctx, b.view) || b.sequence !== s.sequence || !Array.isArray(b.changes))
        return;
    const changes = b.changes.filter((x: Message) => acceptableChange(ctx, x, b.view, b.sequence, n.head));
    if (new Set(changes.map((x: Message) => x.from)).size < 2 * f(ctx) + 1)
        return;
    const cert = highest(changes);
    if ((cert?.proposal.body.block.id ?? null) !== (b.prepared?.proposal.body.block.id ?? null))
        return;
    s.view = b.view;
    s.requestedView = b.view;
    ctx.observe('VIEW_CHANGED', { view: b.view, leader: leader(ctx, b.view), sequence: s.sequence });
    timeout(ctx);
    if (cert) {
        const block = cert.proposal.body.block;
        if (n.id === leader(ctx, b.view))
            ctx.broadcast('PRE_PREPARE', { view: b.view, sequence: s.sequence, block });
    }
    else if (n.id === leader(ctx, b.view))
        propose(ctx);
    const future = s.future;
    s.future = [];
    for (const saved of future)
        pbft.message(ctx, saved);
}
export const pbft: ConsensusModule = {
    init(ctx) { if (member(ctx,ctx.node.id)) { timeout(ctx); propose(ctx); } },
    timer(ctx, name, data) {
        const s = ctx.node.pbft;
        if (!member(ctx,ctx.node.id) && name !== 'sync') return;
        if (name === 'propose' && data.sequence === s.sequence)
            propose(ctx);
        if (name === 'timeout' && data.sequence === s.sequence && data.view === s.requestedView)
            change(ctx, Math.max(s.view, s.requestedView) + 1);
        if (name === 'sync') {
            const pending = s.pending;
            s.pending = [];
            for (const c of pending.sort((a, b) => a.sequence - b.sequence))
                installCommit(ctx, c);
            if (!member(ctx,ctx.node.id)) return;
            for (const cert of [...s.certificates.values()].slice(-8))
                ctx.broadcast('COMMITTED', cert);
            for (const [k, p] of s.proposals)
                if (p.body.view === s.view && p.body.sequence === s.sequence) {
                    const body = { view: s.view, sequence: s.sequence, digest: p.body.block.id };
                    if (ctx.node.id === leader(ctx, s.view))
                        ctx.broadcast('PRE_PREPARE', p.body);
                    if (s.sentPrepare.has(k))
                        ctx.broadcast('PREPARE', body);
                    if (s.sentCommit.has(k))
                        ctx.broadcast('COMMIT', body);
                }
        }
    },
    message(ctx, m) {
        const s = ctx.node.pbft, b = m.body;
        if (m.type === 'BLOCK') return;
        if (m.type === 'COMMITTED') { installCommit(ctx,b); return; }
        if (!member(ctx,ctx.node.id)) return;
        if (!member(ctx,m.from)) { ctx.observe('MESSAGE_REJECTED_LOCAL',{messageType:m.type,from:m.from,reason:'not-in-pbft-committee'}); return; }
        if (['PRE_PREPARE', 'PREPARE', 'COMMIT'].includes(m.type) && b?.view > s.view && b.sequence === s.sequence) {
            if (s.future.length < 128)
                s.future.push(m);
            return;
        }
        if (m.type === 'PRE_PREPARE')
            proposal(ctx, m);
        if (m.type === 'PREPARE' || m.type === 'COMMIT') {
            if (!b || b.view !== s.view || b.sequence !== s.sequence || typeof b.digest !== 'string')
                return;
            if (m.type === 'PREPARE' && m.from === leader(ctx, b.view))
                return;
            const k = key(b.view, b.sequence, b.digest), map = m.type === 'PREPARE' ? s.prepares : s.commits;
            const group = map.get(k) ?? new Map();
            group.set(m.from, m);
            map.set(k, group);
            reconcile(ctx, k);
        }
        if (m.type === 'VIEW_CHANGE') {
            if (!b || !Number.isSafeInteger(b.view) || b.view <= s.view || b.sequence !== s.sequence || !acceptableChange(ctx, m, b.view, s.sequence, ctx.node.head))
                return;
            const group = s.changes.get(b.view) ?? new Map();
            group.set(m.from, m);
            s.changes.set(b.view, group);
            if (group.size >= f(ctx) + 1 && s.requestedView < b.view)
                change(ctx, b.view);
            const k = `${b.view}:${s.sequence}`;
            if (ctx.node.id === leader(ctx, b.view) && group.size >= 2 * f(ctx) + 1 && !s.sentNewViews.has(k)) {
                s.sentNewViews.add(k);
                const changes = [...group.values()];
                ctx.broadcast('NEW_VIEW', { view: b.view, sequence: s.sequence, changes, prepared: highest(changes) });
            }
        }
        if (m.type === 'NEW_VIEW')
            newView(ctx, m);
    }
};
