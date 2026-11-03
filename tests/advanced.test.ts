import test from 'node:test';
import assert from 'node:assert/strict';
import { MiningRace, verifyProof, targetFor } from '../src/advanced/pow-proof.js';
import { StakingLab } from '../src/advanced/staking.js';
import { aggregate, explainEvent, replay, wilson, type Sample } from '../src/advanced/analysis.js';
import { Simulation } from '../src/core/engine.js';
import { hash, verify } from '../src/core/primitives.js';

test('PoW réel : nonce trouvé, hash sous la cible et altérations refusées', () => {
  const race = new MiningRace(42, 2); while (!race.winner && race.attempts < 100000) race.batch(500);
  assert.ok(race.winner); const proof = race.winner!;
  assert.equal(proof.hash, hash(proof.header)); assert.ok(proof.hash <= targetFor(2)); assert.equal(verifyProof(proof, 2), true);
  assert.equal(verifyProof({ ...proof, hash: 'f'.repeat(64) }, 2), false);
  assert.equal(verifyProof({ ...proof, header: { ...proof.header, nonce: proof.header.nonce + 1 } }, 2), false);
  assert.equal(verifyProof(proof, 3), false); assert.equal(race.counts.reduce((a, b) => a + b, 0), race.attempts);
});
test('PoW réel : taille des lots indépendante de la preuve et puissance bornée', () => {
  const a = new MiningRace(7, 2, [55, 15, 15, 15]), b = new MiningRace(7, 2, [55, 15, 15, 15]);
  while (!a.winner) a.batch(1); while (!b.winner) b.batch(1000); assert.deepEqual(a.winner, b.winner); assert.deepEqual(a.counts, b.counts);
  assert.throws(() => new MiningRace(1, 5)); assert.throws(() => new MiningRace(1, 2, [90, 90]));
});
test('staking : dépôt sans création monétaire, poids figés et votes historiques vérifiables', () => {
  const lab = new StakingLab(); lab.deposit('n0', 300); assert.equal(lab.wallets[0].available, 500); assert.equal(lab.wallets[0].staked, 500); assert.equal(lab.weights.n0, 200);
  for (let i = 0; i < 4; i++) lab.step(); assert.equal(lab.weights.n0, 500); assert.equal(lab.weightHistory[0].n0, 200);
  for (const vote of lab.checkpoints[0].votes) { const { signature, ...payload } = vote; assert.ok(verify(vote.validator, payload, signature)); assert.equal(vote.weight, lab.weightHistory[0][vote.validator]); }
  lab.assertInvariant();
});
test('staking : retrait réservé, pas de double retrait et libération après deux époques', () => {
  const lab = new StakingLab(); lab.withdraw('n0', 150); assert.equal(lab.wallets[0].available, 800); assert.equal(lab.wallets[0].staked, 200); assert.throws(() => lab.withdraw('n0', 100));
  for (let i = 0; i < 4; i++) lab.step(); assert.equal(lab.weights.n0, 50); assert.equal(lab.wallets[0].withdrawals.length, 1);
  for (let i = 0; i < 4; i++) lab.step(); assert.equal(lab.wallets[0].withdrawals.length, 0); assert.equal(lab.wallets[0].staked, 50); assert.ok(lab.wallets[0].available >= 950); lab.assertInvariant();
});
test('staking : fonds insuffisants et montants invalides ne modifient pas le registre', () => {
  const lab = new StakingLab(), before = lab.snapshot(); assert.throws(() => lab.deposit('n0', 900)); assert.throws(() => lab.deposit('n0', 0)); assert.throws(() => lab.withdraw('n0', 1.5)); assert.deepEqual(lab.snapshot(), before);
});
test('staking : 20 % silencieux permet la finalité, 40 % la bloque au départ', () => {
  const a = new StakingLab(42, [200, 400, 200, 200]), b = new StakingLab(42, [400, 200, 200, 200]); a.behavior('n0', 'silent'); b.behavior('n0', 'silent');
  for (let i = 0; i < 12; i++) { a.step(); b.step(); } assert.ok(a.finalizedHeight > 0); assert.equal(b.finalizedHeight, 0); assert.ok(b.blocks.length > 0); assert.ok(a.burned > 0); a.assertInvariant(); b.assertInvariant();
});
test('staking : preuve de double proposition et destruction comptable réelle', () => {
  const lab = new StakingLab(42, [400, 200, 200, 200]); lab.behavior('n0', 'double'); for (let i = 0; i < 24 && !lab.burned; i++) lab.step();
  assert.ok(lab.events.some(e => e.type === 'DOUBLE_PROPOSAL_PROOF')); assert.ok(lab.burned >= 1); assert.equal(lab.snapshot().supply, 4000 + lab.issued - lab.burned); lab.assertInvariant();
  for (const p of lab.snapshot().proofs) { assert.ok(verify(p.validator, p.first, p.signatureFirst)); assert.ok(verify(p.validator, p.second, p.signatureSecond)); assert.notDeepEqual(p.first, p.second); }
});
test('séries : aucun délai absent ou essai partiel ne devient un zéro ou un succès', () => {
  const sim = new Simulation(), c = { ...sim.config, attack: 'double' as const };
  const samples: Sample[] = [{ seed: 1, protocol: 'pow', config: c, metrics: { ...sim.metrics(), doubleSpend: 'success' }, termination: 'duration' }, { seed: 2, protocol: 'pow', config: c, metrics: { ...sim.metrics(), doubleSpend: 'failed' }, termination: 'duration' }, { seed: 3, protocol: 'pow', config: c, metrics: { ...sim.metrics(), doubleSpend: 'success' }, termination: 'event-limit' }];
  const result = aggregate(samples)[0]; assert.equal(result.complete, 2); assert.equal(result.partial, 1); assert.equal(result.successful, 1); assert.equal(result.noSettlement, 2); assert.equal(result.settlementMedian, null);
  assert.equal(wilson(0, 0), null); assert.ok(wilson(0, 3)![1] > 0); assert.ok(wilson(3, 3)![0] < 1);
});
test('relecture : l’état final recalculé égale l’export original sans mutation', () => {
  const sim = new Simulation({ duration: 14000, attackStart: 1000, releaseAt: 9000, seed: 17 }); sim.run(); const before = structuredClone(sim.export());
  assert.deepEqual(replay(sim.config, sim.trace.length - 1), sim.snapshot()); assert.deepEqual(sim.export(), before);
  const head = sim.trace.find(e => e.type === 'HEAD_CHANGED'); assert.ok(head); assert.match(explainEvent(head!, sim.config, sim.snapshot().blocks).reason, /travail cumulé/);
});
test('explication : le quorum PBFT utilise le nombre de nœuds du run', () => {
  const c = new Simulation({ protocol: 'pbft', nodeCount: 7 }).config;
  const explanation = explainEvent({ seq: 1, time: 500, node: 'n1', type: 'BLOCK_COMMITTED_LOCAL', data: { votes: 5, sequence: 1, view: 0 } }, c, []);
  assert.match(explanation.reason, /5 COMMIT/); assert.match(explanation.reason, /4 PREPARE/); assert.match(explanation.evidence, /5 COMMIT/);
});
