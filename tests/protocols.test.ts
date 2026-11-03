import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/core/engine.js';
import { ancestors, descends } from '../src/core/ledger.js';
import type { Config, Protocol } from '../src/core/types.js';
const short = { nodeCount: 4, duration: 24000, releaseAt: 15000, attackStart: 3000, seed: 42 };
function safety(s: Simulation) { const honest = s.nodes.filter(n => !n.faulty); for (const a of honest)
    for (const b of honest) {
        const blockA = a.blocks.get(a.finalized.block)!;
        const blockB = b.blocks.get(b.finalized.block)!;
        if (blockA.height <= blockB.height && b.blocks.has(blockA.id))
            assert.ok(descends(b.blocks, blockB.id, blockA.id));
    } for (const n of honest) {
    const ledger = n.ledgers.get(n.head)!;
    assert.equal(Object.values(ledger).reduce((sum, a) => sum + a.balance, 0), 6000);
    assert.ok(Object.values(ledger).every(a => a.balance >= 0));
} }
for (const protocol of ['pow', 'pos', 'pbft'] as Protocol[])
    test(protocol + ' : progression honnête, registre conservé, événements ordonnés', () => { const s = new Simulation({ ...short, protocol }); s.run(); assert.ok(s.metrics().blocks > 0); assert.ok(s.metrics().transactions > 0); assert.ok(s.trace.every((e, i) => e.seq === i && (i === 0 || e.time >= s.trace[i - 1].time))); safety(s); });
test('même configuration et seed : même trace, mêmes mesures', () => { const a = new Simulation({ ...short, protocol: 'pow' }), b = new Simulation({ ...short, protocol: 'pow' }); a.run(); b.run(); assert.deepEqual(a.export(), b.export()); });
test('vitesse d’animation et découpage des appels : aucune incidence', () => { const a = new Simulation({ ...short, protocol: 'pos' }), b = new Simulation({ ...short, protocol: 'pos' }); a.run(); while (!b.done)
    b.advance(b.time + 777); assert.deepEqual(a.trace, b.trace); assert.deepEqual(a.metrics(), b.metrics()); });
test('PoW : pas de finalité déterministe inventée', () => { const s = new Simulation({ ...short, protocol: 'pow' }); s.run(); assert.equal(s.metrics().finalizedHeight, 0); assert.equal(s.trace.some(e => e.type === 'CHECKPOINT_FINALIZED'), false); });
test('PoW : branche privée ne se propage pas avant publication', () => { const s = new Simulation({ ...short, protocol: 'pow', attack: 'majority', attackerShare: .8 }); s.advance(14000); const attacker = s.nodes[0]; assert.ok(attacker.privateBlocks.length > 0); for (const id of attacker.privateBlocks)
    for (const n of s.nodes.slice(1))
        assert.equal(n.blocks.has(id), false); });
test('PoW : double dépense observée seulement après livraison et remplacement', () => { const s = new Simulation({ protocol: 'pow', attack: 'double', attackerShare: .65, confirmations: 2, seed: 7 }); s.run(); assert.equal(s.metrics().doubleSpend, 'success'); assert.notEqual(s.merchant.acceptedAt, null); const n = s.nodes.find(n => n.id === s.observer)!; const tx = ancestors(n.blocks, n.head).flatMap(b => b.txs); assert.ok(tx.some(t => t.id === s.merchant.conflict)); assert.equal(tx.some(t => t.id === s.merchant.payment), false); assert.equal(n.ledgers.get(n.head)!.marchand.balance, 1000); assert.ok(s.metrics().reorgs > 0); safety(s); assert.equal(s.transactions.get(s.merchant.payment!)!.nonce, s.transactions.get(s.merchant.conflict!)!.nonce); });
test('PoS : justification et finalité distinctes', () => { const s = new Simulation({ ...short, protocol: 'pos', duration: 48000, releaseAt: 30000 }); s.run(); assert.ok(s.trace.some(e => e.type === 'CHECKPOINT_JUSTIFIED')); assert.ok(s.trace.some(e => e.type === 'CHECKPOINT_FINALIZED')); assert.ok(s.metrics().finalizedHeight < s.metrics().blocks); safety(s); });
test('PoS : plus d’un tiers silencieux empêche la finalité du modèle fixe', () => { const s = new Simulation({ ...short, protocol: 'pos', attack: 'byzantine', attackStart: 0, attackerShare: .4, duration: 36000, releaseAt: 20000 }); s.run(); assert.ok(s.metrics().blocks > 0); assert.equal(s.metrics().finalizedHeight, 0); });
test('PBFT : les certificats sont signés par au moins 2f+1 identités distinctes', () => { const s = new Simulation({ ...short, protocol: 'pbft' }); s.run(); for (const n of s.nodes)
    for (const cert of n.pbft.certificates.values()) {
        assert.ok(new Set(cert.commits.map(m => m.from)).size >= 3);
        assert.ok(cert.commits.every(m => m.type === 'COMMIT' && m.body.digest === cert.block.id));
    } safety(s); });
test('PBFT : un leader silencieux conduit à une nouvelle vue et à la reprise', () => { const s = new Simulation({ ...short, protocol: 'pbft', attack: 'byzantine', attackStart: 0, duration: 40000, releaseAt: 20000 }); s.run(); assert.ok(s.trace.some(e => e.type === 'VIEW_CHANGED')); assert.ok(s.metrics().blocks > 0); safety(s); });
test('PBFT : une partition 2+2 ne réunit pas de quorum et la reprise fonctionne', () => { const s = new Simulation({ ...short, protocol: 'pbft', attack: 'partition', attackStart: 0, duration: 40000, releaseAt: 15000 }); s.advance(13000); assert.equal(s.metrics().finalizedHeight, 0); assert.ok(s.metrics().dropped > 0); s.run(); assert.ok(s.metrics().blocks > 0); safety(s); });
test('métriques : absence de décision = null, jamais délai zéro', () => { const s = new Simulation({ ...short, protocol: 'pbft', attack: 'partition', attackStart: 0 }); s.advance(10000); assert.equal(s.metrics().medianSettlement, null); assert.ok(s.metrics().unfinished > 0); });
