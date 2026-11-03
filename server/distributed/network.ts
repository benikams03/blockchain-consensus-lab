import { fork, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { Random } from '../../src/core/primitives.js';
import { transaction } from '../../src/core/ledger.js';
import type { Message } from '../../src/core/types.js';
import type { ChildOutput, DistributedConfig, ProcessConfig, ReplicaSnapshot } from './types.js';

export function distributedConfig(input: Partial<DistributedConfig> = {}): DistributedConfig {
  const c: DistributedConfig = { nodes: 4, latencyMin: 5, latencyMax: 40, duration: 20000, seed: 42, fault: 'honest', faultyNodes: 1, ...input };
  if (![4, 7].includes(c.nodes) || !['honest', 'silent', 'equivocate', 'withhold', 'invalid'].includes(c.fault) || !Number.isSafeInteger(c.duration) || c.duration < 5000 || c.duration > 60000 || !Number.isSafeInteger(c.latencyMin) || !Number.isSafeInteger(c.latencyMax) || c.latencyMin < 0 || c.latencyMax > 500 || c.latencyMin > c.latencyMax || !Number.isSafeInteger(c.seed) || c.seed < 0 || !Number.isInteger(c.faultyNodes) || c.faultyNodes < 1 || c.faultyNodes > Math.min(3, c.nodes - 1)) throw new Error('DISTRIBUTED_CONFIG');
  return c;
}
export class DistributedNetwork {
  readonly id = randomUUID(); readonly config: DistributedConfig; readonly ids: string[];
  readonly snapshots = new Map<string, ReplicaSnapshot>();
  readonly events: { seq: number; time: number; node: string; type: string; data: Record<string, unknown> }[] = [];
  private children = new Map<string, ChildProcess>(); private random: Random; private timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly secret = randomBytes(24).toString('hex'); private readonly root: string;
  private lastMessage: Message | null = null; private sequence = 0; private originTime = Date.now();
  sent = 0; delivered = 0; dropped = 0; partition = false; finished = false;
  constructor(input: Partial<DistributedConfig> = {}, stateRoot = 'artifacts/runtime') { this.config = distributedConfig(input); this.ids = Array.from({ length: this.config.nodes }, (_, i) => `n${i}`); this.root = resolve(stateRoot, this.id); this.random = new Random(this.config.seed); }
  private event(node: string, type: string, data: Record<string, unknown> = {}) { this.events.push({ seq: this.sequence++, time: Date.now() - this.originTime, node, type, data }); if (this.events.length > 3000) this.events.shift(); }
  private later(fn: () => void, delay: number) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, delay); this.timers.add(t); }
  private async spawn(id: string) {
    const child = fork(fileURLToPath(new URL('./replica.js', import.meta.url)), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [], windowsHide: true }); this.children.set(id, child);
    const processConfig: ProcessConfig = { id, ids: this.ids, fault: Number(id.slice(1)) < this.config.faultyNodes ? this.config.fault : 'honest', stateFile: resolve(this.root, `${id}.json`), originTime: this.originTime, domain: this.id, latencyMax: this.config.latencyMax, secret: this.secret };
    child.stderr?.on('data', data => this.event(id, 'PROCESS_STDERR', { text: String(data).slice(0, 200) }));
    child.on('exit', () => { if (this.children.get(id) === child) this.children.delete(id); this.event(id, 'PROCESS_EXIT'); });
    await new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => rejectReady(new Error('REPLICA_START_TIMEOUT')), 15000);
      child.on('error', e => { clearTimeout(timeout); rejectReady(e); });
      child.on('message', (data: ChildOutput) => {
        if (data.type === 'ready' || data.type === 'snapshot') { this.snapshots.set(id, data.snapshot); if (data.type === 'ready') { clearTimeout(timeout); resolveReady(); } }
        if (data.type === 'message') this.route(data.message);
        if (data.type === 'event') this.event(id, data.event, data.data);
        if (data.type === 'error') this.event(id, 'PROCESS_ERROR', { message: data.message });
      });
      child.send({ type: 'init', config: processConfig });
    });
  }
  async start() {
    await mkdir(this.root, { recursive: true }); this.originTime = Date.now();
    try { await Promise.all(this.ids.map(id => this.spawn(id))); for (const child of this.children.values()) child.send({ type: 'start' }); }
    catch (e) { await this.close(); throw e; }
    const txs = [transaction('alice', 'benji', 8, 0), transaction('kam', 'lea', 6, 0)];
    for (const child of this.children.values()) for (const tx of txs) child.send({ type: 'tx', tx });
    this.later(() => { this.event('réseau', 'DURATION_REACHED'); void this.close(); }, this.config.duration);
    return this.snapshot();
  }
  private cut(from: string, to: string) { return this.partition && (Number(from.slice(1)) < Math.ceil(this.ids.length / 2)) !== (Number(to.slice(1)) < Math.ceil(this.ids.length / 2)); }
  private route(m: Message) {
    if (this.finished) return; this.sent++; this.lastMessage = m;
    const delay = this.config.latencyMin + Math.floor(this.random.next() * (this.config.latencyMax - this.config.latencyMin + 1));
    if (this.cut(m.from, m.to)) { this.dropped++; return; }
    this.later(() => { void this.deliver(m); }, delay);
  }
  private async deliver(m: Message) {
    const s = this.snapshots.get(m.to);
    if (this.finished || !s || !this.children.has(m.to) || this.cut(m.from, m.to)) { this.dropped++; return; }
    try { const r = await fetch(`http://127.0.0.1:${s.port}/message`, { method: 'POST', headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(m), signal: AbortSignal.timeout(3000) }); if (r.ok) this.delivered++; else this.dropped++; } catch { this.dropped++; }
  }
  async action(action: string, id = 'n0') {
    if (this.finished) throw new Error('NETWORK_FINISHED');
    if (!this.ids.includes(id)) throw new Error('NODE_UNKNOWN');
    if (action === 'crash') {
      const child = this.children.get(id); if (child) { this.children.delete(id); await new Promise<void>(resolveExit => { child.once('exit', () => resolveExit()); child.kill(); }); this.event(id, 'CRASH'); }
    } else if (action === 'restart') { if (!this.children.has(id)) { await this.spawn(id); this.children.get(id)!.send({ type: 'start' }); this.event(id, 'RESTORED_FROM_JOURNAL'); } }
    else if (action === 'partition') { this.partition = true; this.event('réseau', 'PARTITION'); }
    else if (action === 'heal') { this.partition = false; this.event('réseau', 'HEALED'); for (const child of this.children.values()) child.send({ type: 'sync' }); }
    else if (action === 'replay') { if (this.lastMessage) { await this.deliver(this.lastMessage); this.event(this.lastMessage.to, 'OLD_MESSAGE_REPLAYED'); } }
    else throw new Error('ACTION_UNKNOWN');
    return this.snapshot();
  }
  snapshot() { return { modelVersion: 'atelier-pbft-process-1.0.0', id: this.id, config: this.config, elapsed: Date.now() - this.originTime, finished: this.finished, partition: this.partition, sent: this.sent, delivered: this.delivered, dropped: this.dropped, nodes: this.ids.map(id => ({ ...(this.snapshots.get(id) ?? { id, pid: null, port: null, height: 0, view: 0, certificates: [], received: 0, rejected: 0, duplicates: 0, restored: false }), online: this.children.has(id) })), events: this.events.slice(-150) }; }
  async close() { if (this.finished) return; this.finished = true; for (const t of this.timers) clearTimeout(t); this.timers.clear(); const children = [...this.children.values()]; this.children.clear(); await Promise.all(children.map(child => new Promise<void>(resolveExit => { if (child.exitCode !== null) return resolveExit(); child.once('exit', () => resolveExit()); child.kill(); }))); }
}
