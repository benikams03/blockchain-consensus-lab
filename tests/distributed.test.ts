import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { DistributedNetwork } from '../server/distributed/network.js';
import { makeServer } from '../server/index.js';
async function until(fn: () => boolean, limit = 18000) { const start = Date.now(); while (!fn()) { if (Date.now() - start > limit) throw new Error('Condition distribuée non atteinte'); await new Promise(r => setTimeout(r, 100)); } }
async function clean(dir: string) { const target = resolve(dir), root = resolve(tmpdir()); assert.ok(target.startsWith(root + sep) && basename(target).startsWith('atelier-')); await rm(target, { recursive: true, force: true }); }
function safety(network: DistributedNetwork) {
  const decisions = new Map<number, string>();
  for (const n of network.snapshots.values()) { assert.equal(Object.values(n.ledger).reduce((s, a) => s + a.balance, 0), 6000); for (const c of n.certificates) { assert.ok(c.votes >= 2 * (network.config.nodes - 1) / 3 + 1); if (decisions.has(c.height)) assert.equal(c.block, decisions.get(c.height)); decisions.set(c.height, c.block); } }
  assert.deepEqual(network.events.filter(e => e.type === 'SAFETY_VIOLATION' || e.type === 'PROCESS_ERROR'), []);
}
test('processus : PID et ports distincts, HTTP, panne, restauration, partition et rejeu', { timeout: 45000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atelier-process-')), net = new DistributedNetwork({ duration: 45000, latencyMin: 1, latencyMax: 5 }, dir);
  try {
    await net.start(); await until(() => [...net.snapshots.values()].every(n => n.height >= 1));
    assert.equal(new Set([...net.snapshots.values()].map(n => n.pid)).size, 4); assert.equal(new Set([...net.snapshots.values()].map(n => n.port)).size, 4); assert.ok(net.delivered > 0);
    const old = net.snapshots.get('n3')!, height = old.height; await net.action('crash', 'n3');
    await until(() => net.snapshots.get('n1')!.height >= height + 1); await net.action('restart', 'n3');
    await until(() => net.snapshots.get('n3')!.height >= height + 1); assert.equal(net.snapshots.get('n3')!.restored, true); assert.notEqual(net.snapshots.get('n3')!.pid, old.pid);
    await net.action('partition'); await until(() => net.dropped > 0, 8000); await net.action('heal'); await net.action('replay'); await until(() => [...net.snapshots.values()].some(n => n.duplicates > 0), 8000);
    safety(net);
  } finally { await net.close(); await clean(dir); }
});
test('processus : propositions contradictoires, changement de vue et décisions compatibles', { timeout: 35000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atelier-equivocation-')), net = new DistributedNetwork({ fault: 'equivocate', duration: 30000, latencyMin: 1, latencyMax: 5 }, dir);
  try { await net.start(); await until(() => [...net.snapshots.values()].filter(n => n.id !== 'n0').every(n => n.height >= 1)); assert.ok(net.events.some(e => e.type === 'EQUIVOCATION_SENT')); assert.ok(net.events.some(e => e.type === 'VIEW_CHANGED')); safety(net); }
  finally { await net.close(); await clean(dir); }
});
test('processus : signatures invalides rejetées sans empêcher le quorum honnête', { timeout: 35000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atelier-invalid-')), net = new DistributedNetwork({ fault: 'invalid', duration: 30000, latencyMin: 1, latencyMax: 5 }, dir);
  try { await net.start(); await until(() => [...net.snapshots.values()].filter(n => n.id !== 'n0').every(n => n.height >= 1)); assert.ok([...net.snapshots.values()].some(n => n.rejected > 0)); safety(net); }
  finally { await net.close(); await clean(dir); }
});
test('API distribuée : capacité, contrôle d’accès, commande idempotente et libération', { timeout: 30000 }, async () => {
  const { server } = makeServer(); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base + '/api/distributed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration: 10000 }) }); assert.equal(response.status, 201); const run = await response.json() as { id: string; token: string };
    const path = base + '/api/distributed/' + run.id; assert.equal((await fetch(path)).status, 403);
    const headers = { Authorization: `Bearer ${run.token}`, 'Content-Type': 'application/json' }, command = { method: 'POST', headers, body: JSON.stringify({ action: 'partition', commandId: 'same' }) };
    await fetch(path + '/commands', command); const repeated = await (await fetch(path + '/commands', command)).json() as { events: { type: string }[] }; assert.equal(repeated.events.filter(e => e.type === 'PARTITION').length, 1);
    assert.equal((await fetch(base + '/api/distributed', { method: 'POST', body: '{}' })).status, 429);
    assert.equal((await fetch(path, { method: 'DELETE', headers })).status, 200); assert.equal((await fetch(path, { headers })).status, 404);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
for (const [fault, nodes] of [['withhold', 7], ['silent', 4]] as const) test(`processus : ${fault === 'withhold' ? 'votes retenus à sept répliques' : 'leader silencieux remplacé'}`, { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atelier-fault-')), net = new DistributedNetwork({ nodes, fault, duration: 25000, latencyMin: 1, latencyMax: 5 }, dir);
  try { await net.start(); await until(() => [...net.snapshots.values()].filter(n => n.id !== 'n0').every(n => n.height >= 1)); if (fault === 'silent') assert.ok(net.events.some(e => e.type === 'VIEW_CHANGED')); safety(net); }
  finally { await net.close(); await clean(dir); }
});
