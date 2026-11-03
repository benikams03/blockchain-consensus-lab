import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/core/engine.js';
import { configuration } from '../src/core/config.js';
import { SCENARIOS } from '../src/web/features/scenarios.js';
import { comparisonSummary, findings, type Result } from '../src/web/features/comparison.js';

test('les neuf scénarios sont distincts, valides et couvrent les trois mécanismes', () => {
  assert.equal(SCENARIOS.length, 9);
  assert.equal(new Set(SCENARIOS.map(s => s.id)).size, 9);
  assert.equal(new Set(SCENARIOS.map(s => JSON.stringify(s.config))).size, 9);
  assert.deepEqual(new Set(SCENARIOS.map(s => s.config.protocol)), new Set(['pow', 'pos', 'pbft']));
  for (const s of SCENARIOS) assert.deepEqual(configuration(s.config), s.config);
});
test('nouveau scénario PoW : publication puis réorganisation sans double dépense', () => {
  const s = new Simulation(SCENARIOS.find(s => s.id === 'majority')!.config); s.run();
  assert.ok(s.trace.some(e => e.type === 'PRIVATE_CHAIN_RELEASED'));
  assert.ok(s.metrics().reorgs > 0);
  assert.equal(s.metrics().doubleSpend, 'not-attempted');
  assert.equal(s.snapshot().termination, 'duration');
});
test('les deux scénarios PoS distinguent production et capacité à finaliser', () => {
  const resilient = new Simulation(SCENARIOS.find(s => s.id === 'resilience')!.config);
  const blocked = new Simulation(SCENARIOS.find(s => s.id === 'finality')!.config);
  resilient.run(); blocked.run();
  assert.ok(resilient.metrics().finalizedHeight > 0);
  assert.equal(blocked.metrics().finalizedHeight, 0);
  assert.ok(blocked.metrics().blocks > 0);
});
test('nouveau scénario PBFT : deux leaders silencieux, reprise et quorum de cinq', () => {
  const s = new Simulation(SCENARIOS.find(s => s.id === 'rotation')!.config); s.run();
  assert.ok(s.trace.some(e => e.type === 'BYZANTINE_SILENCE' && e.node === 'n0'));
  assert.ok(s.trace.some(e => e.type === 'BYZANTINE_SILENCE' && e.node === 'n1'));
  assert.ok(Math.max(...s.snapshot().nodes.map(n => n.view)) >= 2);
  assert.ok(s.metrics().finalizedHeight > 0);
  for (const n of s.nodes.filter(n => !n.faulty)) for (const cert of n.pbft.certificates.values()) assert.ok(new Set(cert.commits.map(m => m.from)).size >= 5);
});
function example(): Result[] {
  const s = new Simulation();
  return (['pow', 'pos', 'pbft'] as const).map((protocol, i) => ({ protocol, config: configuration({ protocol }), metrics: { ...s.metrics(), transactions: 10, settledTransactions: 8, medianInclusion: 1000, medianSettlement: [5000, 8000, 2000][i], messages: [100, 200, 900][i], tps: .5 }, termination: 'duration' }));
}
test('interprétation : conclusion issue des mesures, garanties distinctes et charge limitée', () => {
  const r = example(), conclusion = comparisonSummary(r);
  assert.match(conclusion, /PBFT atteint/); assert.match(conclusion, /POW envoie/); assert.match(conclusion, /charge injectée/);
  assert.equal(findings(r).length, 3);
  assert.match(findings(r)[0].interpretation, /3 confirmations/);
  assert.match(findings(r)[2].boundary, /3f \+ 1/);
  r[0].metrics.messages = 2000;
  assert.match(comparisonSummary(r), /POS envoie/);
});
test('interprétation : absence de finalité et trace tronquée ne deviennent pas un résultat gagnant', () => {
  const r = example(); r[1].metrics.medianSettlement = null;
  assert.match(findings(r)[1].interpretation, /Aucune transaction/);
  r[2].termination = 'event-limit';
  assert.equal(findings(r)[2].title, 'Mesure incomplète');
  assert.match(comparisonSummary(r), /trois exécutions doivent être terminées/);
});
