import { existsSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { createServer } from 'node:http';
import { pbft } from '../../src/consensus/pbft/index.js';
import { configuration } from '../../src/core/config.js';
import { applyTransactions, genesis, genesisLedger, makeBlock, validateBlock, validTransaction } from '../../src/core/ledger.js';
import { hash, sign, verify } from '../../src/core/primitives.js';
import type { Block, Message, ModuleContext, NodeState, Transaction } from '../../src/core/types.js';
import type { ChildOutput, ProcessConfig, ReplicaSnapshot } from './types.js';

// This process owns exactly one replica. Other states are never available here.
let options: ProcessConfig, node: NodeState, received = 0, rejected = 0, duplicates = 0, restored = false, messageSeq = 0, port = 0, journalGeneration = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const output = (data: ChildOutput) => { if (process.connected) process.send?.(data); };
const now = () => Date.now() - options.originTime;
const encode = (_key: string, value: unknown) => value instanceof Map ? { $map: [...value] } : value instanceof Set ? { $set: [...value] } : value;
const decode = (_key: string, value: any) => value?.$map ? new Map(value.$map) : value?.$set ? new Set(value.$set) : value;
function save() {
  const payload = JSON.stringify({ node, messageSeq, received, rejected, duplicates }, encode), generation = journalGeneration + 1;
  // Alternate two durable, checksummed frames. No replacement rename is required on Windows.
  const fd = openSync(options.stateFile + '.' + generation % 2, 'w');
  try { writeFileSync(fd, JSON.stringify({ generation, checksum: hash(payload), payload })); fsyncSync(fd); } finally { closeSync(fd); }
  journalGeneration = generation;
}
function restore() {
  const frames: { generation: number; payload: string }[] = [];
  for (const slot of [0, 1]) { const file = options.stateFile + '.' + slot; if (!existsSync(file)) continue; try { const frame = JSON.parse(readFileSync(file, 'utf8')); if (Number.isSafeInteger(frame.generation) && typeof frame.payload === 'string' && frame.checksum === hash(frame.payload)) frames.push(frame); } catch {} }
  if (!frames.length) { if ([0, 1].some(slot => existsSync(options.stateFile + '.' + slot))) throw new Error('JOURNAL_CORRUPT'); return false; }
  const frame = frames.sort((a, b) => b.generation - a.generation)[0], old = JSON.parse(frame.payload, decode); journalGeneration = frame.generation;
  node = old.node; messageSeq = old.messageSeq; received = old.received; rejected = old.rejected; duplicates = old.duplicates; return true;
}
function snapshot(): ReplicaSnapshot { return { id: node.id, pid: process.pid, port, height: node.blocks.get(node.head)!.height, head: node.head, view: node.pbft.view, ledger: structuredClone(node.ledgers.get(node.head)!), certificates: [...node.pbft.certificates.values()].map(c => ({ height: c.sequence, block: c.block.id, votes: new Set(c.commits.map(m => m.from)).size })), received, rejected, duplicates, restored }; }
function fresh(): NodeState {
  const g = genesis('pbft'), cp = { epoch: 0, block: g.id };
  return { id: options.id, index: options.ids.indexOf(options.id), faulty: options.fault === 'silent', power: 0, stake: 1, blocks: new Map([[g.id, g]]), ledgers: new Map([[g.id, genesisLedger()]]), mempool: new Map(), head: g.id, finalized: cp, justified: cp, justifiedSet: new Map([['0:' + g.id, cp]]), pendingBlocks: new Map(), seen: new Set(), timers: new Map(), privateHead: null, privateBlocks: [], privateTransactions: new Map(), released: false, headVotes: new Map(), linkVotes: new Map(), votedEpochs: new Set(), votesHistory: new Map(), pbft: { view: 0, sequence: 1, requestedView: 0, proposals: new Map(), prepares: new Map(), commits: new Map(), sentPrepare: new Set(), sentCommit: new Set(), prepared: null, changes: new Map(), sentChanges: new Set(), sentNewViews: new Set(), certificates: new Map(), pending: [], future: [] } };
}
function auth(m: Pick<Message, 'from' | 'type' | 'body'>) { return { domain: options.domain, from: m.from, type: m.type, body: m.body }; }
function send(to: string, type: string, body: any) {
  if (options.fault === 'withhold' && ['PREPARE', 'COMMIT'].includes(type)) return;
  const m: Message = { id: `${node.id}:${++messageSeq}`, from: node.id, to, type, body, sentAt: now(), signature: '' };
  m.signature = options.fault === 'invalid' ? '00'.repeat(64) : sign(node.id, auth(m)); save(); output({ type: 'message', message: m });
}
function accept(b: Block): boolean {
  if (!b || b.protocol !== 'pbft') return false;
  if (node.blocks.has(b.id)) return true;
  const parent = node.blocks.get(b.parent!); if (!parent) { node.pendingBlocks.set(b.id, b); return false; }
  try { const ledger = validateBlock(b, parent, node.ledgers.get(parent.id)!, 5, options.ids); node.blocks.set(b.id, b); node.ledgers.set(b.id, ledger); return true; } catch { rejected++; return false; }
}
function select(parent: string) {
  let ledger = structuredClone(node.ledgers.get(parent)!); const result: Transaction[] = [], remaining = [...node.mempool.values()];
  let progress = true; while (progress && result.length < 5) { progress = false; for (let i = 0; i < remaining.length && result.length < 5; i++) { const t = remaining[i]; if (!t) continue; try { ledger = applyTransactions(ledger, [t]); result.push(t); remaining.splice(i--, 1); progress = true; } catch {} } } return result;
}
function context(): ModuleContext {
  return { config: configuration({ protocol: 'pbft', nodeCount: options.ids.length, latencyMin: 0, latencyMax: options.latencyMax, attackStart: 0 }), now: now(), node, ids: options.ids, random: () => .5,
    after(name, delay, data) { const old = timers.get(name); if (old) clearTimeout(old); timers.set(name, setTimeout(() => { try { pbft.timer(context(), name, data); save(); output({ type: 'snapshot', snapshot: snapshot() }); } catch (e) { output({ type: 'error', message: (e as Error).message }); } }, Math.max(1, delay))); },
    send, broadcast(type, body) {
      let alternative: Block | null = null;
      if (options.fault === 'equivocate' && type === 'PRE_PREPARE') {
        const b = body.block as Block, parent = node.blocks.get(b.parent!)!; alternative = makeBlock(parent, node.id, b.time + 1, b.txs.slice(1), 'pbft'); accept(alternative);
        output({ type: 'event', node: node.id, event: 'EQUIVOCATION_SENT', data: { view: body.view, sequence: body.sequence, first: b.id, second: alternative.id } });
      }
      options.ids.forEach((id, i) => send(id, type, alternative && i % 2 ? { ...body, block: alternative } : body));
    },
    observe(type, data) { output({ type: 'event', node: node.id, event: type, data }); },
    propose(txs, slot = 0, parent = node.head) { return makeBlock(node.blocks.get(parent)!, node.id, now(), txs ?? select(parent), 'pbft', slot); }, accept,
    adopt(id) { if (!node.blocks.has(id) || id === node.head) return false; node.head = id; const ledger = node.ledgers.get(id)!; for (const [tid, t] of node.mempool) if (ledger[t.from].nonce > t.nonce) node.mempool.delete(tid); return true; },
    select: (parent = node.head) => select(parent), sign: data => sign(node.id, data), verify, verifyMessage: m => !!m && options.ids.includes(m.from) && verify(m.from, auth(m), m.signature), weight: () => 1 };
}
function handle(data: any) {
  try {
    if (data.type === 'init') {
      options = data.config; restored = restore(); if (!restored) node = fresh();
      listener.listen(0, '127.0.0.1', () => { port = (listener.address() as { port: number }).port; output({ type: 'ready', snapshot: snapshot() }); }); return;
    }
    if (data.type === 'start') { pbft.init(context()); context().after('sync', 1000); }
    if (data.type === 'tx') { if (validTransaction(data.tx)) node.mempool.set(data.tx.id, data.tx); }
    if (data.type === 'message') {
      const m = data.message as Message; received++;
      if (m.to !== node.id || !context().verifyMessage(m)) { rejected++; output({ type: 'event', node: node.id, event: 'MESSAGE_REJECTED', data: { from: m.from, type: m.type } }); }
      else if (node.seen.has(m.id)) duplicates++;
      else {
        node.seen.add(m.id);
        if (m.type === 'GET_BLOCK') { const b = node.blocks.get(m.body.id); if (b) send(m.from, 'BLOCK', b); }
        else if (m.type === 'BLOCK') accept(m.body);
        else pbft.message(context(), m);
      }
    }
    if (data.type === 'sync') { pbft.timer(context(), 'sync', {}); }
    save(); output({ type: 'snapshot', snapshot: snapshot() });
  } catch (e) { output({ type: 'error', message: (e as Error).message }); }
}
process.on('message', handle);
const listener = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/message' || req.headers.authorization !== `Bearer ${options?.secret}`) { res.writeHead(403); res.end(); return; }
  try { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 1_000_000) throw new Error('SIZE'); } handle({ type: 'message', message: JSON.parse(text) }); res.writeHead(204); res.end(); } catch { res.writeHead(400); res.end(); }
});
// Periodic synchronization is independent of the PBFT progress timeout.
const sync = setInterval(() => { if (!node) return; try { pbft.timer(context(), 'sync', {}); save(); output({ type: 'snapshot', snapshot: snapshot() }); } catch (e) { output({ type: 'error', message: (e as Error).message }); } }, 1000);
process.on('disconnect', () => { clearInterval(sync); for (const t of timers.values()) clearTimeout(t); listener.close(); process.exit(0); });
