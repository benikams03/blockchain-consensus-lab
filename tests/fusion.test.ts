import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, participants, FUSION_MODEL } from '../src/fusion/engine.js';
import { verifyPublicCertificate } from '../src/fusion/verification.js';
import { Simulation as Legacy } from '../src/core/engine.js';
import { configuration } from '../src/core/config.js';
import { makeBlock } from '../src/core/ledger.js';
import { pos } from '../src/consensus/pos/index.js';
import { merkleWitness, merkleRoot, verifyMerkleWitness, MiningRace } from '../src/advanced/pow-proof.js';
import { StakingLab } from '../src/advanced/staking.js';
import { hash } from '../src/core/primitives.js';
import { anchorPayload, requireSepolia } from '../src/blockchain/anchor.js';
import { SCENARIOS } from '../src/web/features/scenarios.js';
const short = { duration: 24000, attackStart: 3000, releaseAt: 15000, transactionCount: 10 };

for (const protocol of ['pow','pos'] as const) test(`Fusion ${protocol} : trois machines, deux producteurs et dix comptes indépendants`, () => {
  const s = new Simulation({ ...short, protocol, nodeCount: 3, accountCount: 10, resources: [80,20,0] }); s.run();
  const snapshot = s.snapshot(); assert.equal(snapshot.modelVersion, FUSION_MODEL); assert.equal(snapshot.time, short.duration);
  assert.equal(snapshot.nodes.length,3); assert.equal(Object.keys(snapshot.nodes[2].ledger).length,10); assert.ok(snapshot.nodes[2].height>0);
  for (const n of snapshot.nodes) assert.equal(Object.values(n.ledger).reduce((sum,a)=>sum+a.balance,0),10000);
  assert.equal(snapshot.blocks.some(b=>b.producer==='n2'),false); assert.equal(snapshot.inspection!.votes.some(v=>v.validator==='n2'),false);
  assert.ok(s.metrics().transactions>0); assert.ok(s.trace.every((e,i)=>e.seq===i && (!i || e.time>=s.trace[i-1].time)));
});

test('Fusion : les ressources personnalisées priment sur le curseur, les tableaux sont isolés', () => {
  const input=[80,20,0], c=configuration({nodeCount:3,resources:input}); input[0]=1; assert.deepEqual(participants(c),[80,20,0]);
  for(const resources of [[0,0,0],[-1,20,0],[80,20]]) assert.throws(()=>configuration({nodeCount:3,resources}));
  assert.throws(()=>configuration({offlineNodes:[1,1]}));
});

test('Fusion : reproductibilité du rapport, du journal et des signatures', () => {
  const a=new Simulation({...short,nodeCount:3,protocol:'pos'}), b=new Simulation({...short,nodeCount:3,protocol:'pos'}); a.run(); while(!b.done)b.advance(b.time+777);
  assert.deepEqual(a.export(),b.export());
});

test('régression : messages authentifiés à corps nul rejetés sans interrompre le moteur historique',()=>{
  for(const protocol of ['pow','pos','pbft'] as const){ const s=new Legacy({...short,nodeCount:4,protocol}) as any;
    s.send(s.nodes[0],'n1',protocol==='pos'?'HEAD_VOTE':'BLOCK',null); assert.doesNotThrow(()=>s.run()); assert.ok(s.trace.some((e:any)=>e.type==='MESSAGE_REJECTED_LOCAL'));
  }
});

test('régression checkpoint : un bloc créé sur la frontière ne devient pas le checkpoint précédent selon l’ordre de réception',()=>{
  for(const blockFirst of [false,true]){
    const s=new Legacy({protocol:'pos',nodeCount:4,slotDuration:1000,epochLength:4,duration:16000,attackStart:1000,releaseAt:12000}) as any;
    s.time=4000; const n=s.nodes[3],g=n.blocks.get(n.head),b=makeBlock(g,s.proposer(4),4000,[],'pos',4),ctx=s.context(n);
    const add=()=>{assert.equal(s.accept(n,b),true);pos.message(ctx,{type:'BLOCK',body:b} as any);}; if(blockFirst)add();
    for(const v of s.nodes.slice(0,3)){const data={source:{epoch:0,block:g.id},target:{epoch:1,block:b.id},validator:v.id};pos.message(ctx,{type:'LINK_VOTE',from:v.id,body:{...data,signature:s.context(v).sign(data)}} as any);}
    if(!blockFirst)add(); assert.equal(n.justifiedSet.has('1:'+b.id),false);
  }
});

test('certificat PoS : vérification publique et rejet d’une signature ou mise modifiée',()=>{
  const s=new Simulation({...short,protocol:'pos',duration:48000,releaseAt:30000});s.run();const e=s.export(), cert=e.snapshot.inspection!.certificates.at(-1)!;assert.ok(cert);
  assert.equal(verifyPublicCertificate(e,cert.id).valid,true);
  const altered:any=structuredClone(e);altered.proofRecord.config.validators[0].stake++;assert.equal(verifyPublicCertificate(altered,cert.id).valid,false);
  const changed:any=structuredClone(e);changed.proofRecord.certificates.find((c:any)=>c.id===cert.id).votes[0].signature='0'.repeat(128);assert.equal(verifyPublicCertificate(changed,cert.id).valid,false);
});

for(const behavior of ['default','silent','withhold','equivocate','invalid'] as const) test(`PBFT byzantin ${behavior} : progression, quorum et préfixe commun`,()=>{
  const s=new Simulation({...short,protocol:'pbft',nodeCount:4,attack:'byzantine',attackStart:0,faultyNodes:1,faultBehavior:behavior,duration:40000,releaseAt:20000});s.run();const e=s.export();
  assert.ok(e.metrics.finalizedHeight>0,behavior);for(const c of e.snapshot.inspection!.certificates){assert.ok(new Set(c.signers).size>=3);assert.equal(verifyPublicCertificate(e,c.id).valid,true);}
  const honest=e.snapshot.nodes.filter(n=>!n.faulty); const lineage=(head:string)=>{const ids:string[]=[];let b=s.blocks.get(head);while(b){ids.unshift(b.id);b=b.parent?s.blocks.get(b.parent):undefined;}return ids;};
  for(const a of honest)for(const b of honest){const x=lineage(a.head),y=lineage(b.head);assert.deepEqual(x.slice(0,Math.min(x.length,y.length)),y.slice(0,Math.min(x.length,y.length)));}
});

test('PBFT : partition 2+2 sans quorum puis reconnexion et récupération des paiements',()=>{
  const s=new Simulation({...short,protocol:'pbft',nodeCount:4,attack:'partition',attackStart:0,duration:50000,releaseAt:15000});s.advance(13000);assert.equal(s.metrics().finalizedHeight,0);s.run();assert.ok(s.metrics().finalizedHeight>0);assert.equal(s.metrics().transactions,10);
});

test('scénario de double dépense : livraison puis remplacement confirmé, k=6 empêche la livraison de cette expérience',()=>{
  const c=SCENARIOS.find(s=>s.id==='double')!.config;const a=new Simulation(c);a.run();assert.equal(a.metrics().doubleSpend,'success');assert.notEqual(a.snapshot().merchant.acceptedAt,null);
  const b=new Simulation({...c,confirmations:6});b.run();assert.equal(b.metrics().doubleSpend,'failed');assert.equal(b.snapshot().merchant.acceptedAt,null);
});

test('preuve Merkle : cinq feuilles, chacune vérifiable et modification détectée',()=>{
  const ids=Array.from({length:5},(_,i)=>hash({i})),root=merkleRoot(ids);for(let i=0;i<ids.length;i++){const w=merkleWitness(ids,i);assert.equal(verifyMerkleWitness(w,root),true);assert.equal(verifyMerkleWitness({...w,transactionId:hash({fake:i})},root),false);}
});

test('ateliers variables : huit mineurs et huit portefeuilles, puissance nulle et conservation monétaire',()=>{
  const m=new MiningRace(42,1,[100,0,0,0,0,0,0,0]);while(!m.winner)m.batch();assert.equal(m.winner.header.miner,'n0');assert.equal(m.counts.slice(1).reduce((a,b)=>a+b,0),0);
  const s=new StakingLab(42,Array(8).fill(100));s.deposit('n7',20);for(let i=0;i<12;i++)s.step();assert.equal(s.initialSupply,8000);assert.doesNotThrow(()=>s.assertInvariant());
});

test('Sepolia : changement demandé, refus et chaîne persistante incorrecte propagés',async()=>{
  const calls:string[]=[];let chain='0x1';await requireSepolia({request:async a=>{calls.push(a.method);if(a.method==='wallet_switchEthereumChain')chain='0xaa36a7';return chain;}});assert.ok(calls.includes('wallet_switchEthereumChain'));
  await assert.rejects(requireSepolia({request:async()=> '0x1'}),/Sepolia/);
});

test('ancrage : rapport achevé seulement et toute modification change son empreinte',()=>{
  const s=new Simulation({...short,nodeCount:3});assert.throws(()=>anchorPayload(s.export()));s.run();const e=s.export(),h=anchorPayload(e).traceHash;const changed:any=structuredClone(e);changed.limitations.push('modification');assert.notEqual(anchorPayload(changed).traceHash,h);
});
