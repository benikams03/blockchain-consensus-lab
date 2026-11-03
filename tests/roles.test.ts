import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration } from '../src/core/config.js';
import { resourceWeights, controlledIndices } from '../src/core/participants.js';
import { Simulation } from '../src/fusion/engine.js';
import { verifyPublicCertificate } from '../src/fusion/verification.js';
import { anchorPayload } from '../src/blockchain/anchor.js';
import { pbft } from '../src/consensus/pbft/index.js';
const fast={duration:16000,attackStart:1000,releaseAt:9000,latencyMin:10,latencyMax:30,blockInterval:1000,slotDuration:1000,epochLength:4,transactionCount:8,txInterval:1000};

test('rôles : réseau, comité et ressources validés séparément',()=>{
  const c=configuration({protocol:'pbft',nodeCount:10,consensusNodes:[0,1,2,3]});assert.equal(c.nodeCount,10);assert.equal(c.consensusNodes.length,4);
  assert.throws(()=>configuration({...c,consensusNodes:[0,1,2,3,4]}),/PBFT_NODE_COUNT/);
  assert.throws(()=>configuration({...c,consensusNodes:[0,0,1,2]}));assert.throws(()=>configuration({...c,consensusNodes:[0,1,2,10]}));
  assert.throws(()=>configuration({nodeCount:5,consensusNodes:[0,1],resources:[10,20,30,0,0]}),/ROLE_MISMATCH/);
  const legacy=configuration({nodeCount:3,resources:[80,0,20]});assert.deepEqual(legacy.consensusNodes,[0,2]);
  const ids=[2,0];const isolated=configuration({nodeCount:4,consensusNodes:ids});ids[0]=3;assert.deepEqual(isolated.consensusNodes,[0,2]);
});

test('rôles : la puissance contrôlée porte sur les seuls mineurs désignés',()=>{
  const c=configuration({nodeCount:8,consensusNodes:[2,5,7],attack:'majority',attackerShare:.65});
  assert.deepEqual(controlledIndices(c),[2]);const w=resourceWeights(c);assert.equal(w[2],650000);assert.equal(w.reduce((a,b)=>a+b,0),1000000);
  for(const i of [0,1,3,4,6])assert.equal(w[i],0);
});

test('PoW : huit nœuds, trois mineurs non contigus, cinq suiveurs sans découverte',()=>{
  const s=new Simulation({...fast,nodeCount:8,consensusNodes:[1,4,6]});s.run();const e=s.export();
  assert.equal(e.snapshot.nodes.filter(n=>n.participates).length,3);assert.ok(e.snapshot.blocks.filter(b=>b.height>0).every(b=>['n1','n4','n6'].includes(b.producer)));
  assert.ok(e.snapshot.inspection!.mining.every(p=>['n1','n4','n6'].includes(p.miner)));assert.ok(e.metrics.transactions>0);
  for(const n of e.snapshot.nodes){assert.ok(n.height>0);assert.equal(Object.values(n.ledger).reduce((s,a)=>s+a.balance,0),6000);}
  assert.equal(e.metrics.observer,'n0');assert.equal(e.snapshot.nodes[0].power,0);
});

test('PoS : neuf nœuds, trois validateurs ; les suiveurs constatent la finalité sans voter',()=>{
  const s=new Simulation({...fast,protocol:'pos',nodeCount:9,consensusNodes:[2,5,7]});s.advance(8000);const raw=s.raw as any;const zeroVote=raw.context('n0').sign({kind:'headVote',slot:8,blockId:raw.nodes.get('n2').headId});raw.deliver('n2','n0',zeroVote);assert.equal(raw.nodes.get('n2').state.latestHeadVotes.has('n0'),false);s.run();const e=s.export(),i=e.snapshot.inspection!;
  assert.ok(e.metrics.finalizedHeight>0);assert.ok(i.votes.length>0);assert.ok(i.votes.every(v=>['n2','n5','n7'].includes(v.validator)));
  assert.ok(i.certificates.every(c=>c.total===30000&&c.signers.every(id=>['n2','n5','n7'].includes(id))));
  assert.equal(verifyPublicCertificate(e,i.certificates.at(-1)!.id).valid,true);
  const changed=structuredClone(e);changed.config.consensusNodes=[0,1,2];assert.equal(verifyPublicCertificate(changed,i.certificates.at(-1)!.id).valid,false);
  assert.ok(e.snapshot.nodes.filter(n=>!n.participates).every(n=>n.stake===0&&n.finalizedHeight>0));
});

for(const members of [[0,1,2,3],[1,2,4,5,7,8,9]])test(`PBFT : 12 machines, comité ${members.length}, quorum propre au comité`,()=>{
  const s=new Simulation({...fast,protocol:'pbft',nodeCount:12,consensusNodes:members});s.run();const e=s.export(),certs=e.snapshot.inspection!.certificates;
  assert.ok(e.metrics.finalizedHeight>0);assert.ok(certs.length>0);const quorum=2*(members.length-1)/3+1;
  for(const cert of certs){assert.equal(cert.total,members.length);assert.ok(cert.signers.length>=quorum);assert.ok(cert.signers.every(id=>members.includes(+id.slice(1))));}
  const followers=e.snapshot.nodes.filter(n=>!n.participates);assert.equal(followers.length,12-members.length);assert.ok(followers.every(n=>n.finalizedHeight>0));
  assert.equal(s.trace.some(e=>e.node&&followers.some(n=>n.id===e.node)&&['PBFT_PHASE','BLOCK_PROPOSED','VIEW_CHANGE_REQUESTED'].includes(e.type)),false);
  assert.equal(s.trace.some(e=>e.type==='MESSAGE_SENT'&&e.node&&followers.some(n=>n.id===e.node)&&['PRE_PREPARE','PREPARE','COMMIT','VIEW_CHANGE','NEW_VIEW'].includes(e.data.messageType)),false);
  assert.equal(verifyPublicCertificate(e,certs.at(-1)!.id).valid,true);const anchor=anchorPayload(e);assert.equal(anchor.nodes,12);assert.equal(anchor.participants,members.length);
});

test('PBFT : des signatures de suiveurs ne deviennent jamais un quorum de COMMIT',()=>{
  const s=new Simulation({...fast,protocol:'pbft',nodeCount:10,consensusNodes:[0,1,2,3],offlineNodes:[0,2,3]});const r=s.raw as any;
  const block=r.context(r.nodes[0]).propose([]),body={view:0,sequence:1,digest:block.id};
  for(const id of ['n4','n5','n6'])r.send(r.nodes[+id.slice(1)],'n1','COMMIT',body);
  s.advance(2000);assert.equal(s.metrics().finalizedHeight,0);assert.ok(s.trace.some(e=>e.type==='MESSAGE_REJECTED_LOCAL'&&e.data.reason==='not-in-pbft-committee'));
  const commits=['n0','n1','n4'].map(from=>({id:'crafted-'+from,from,to:'n1',type:'COMMIT',body,sentAt:0,signature:r.signData(from,r.authData({from,type:'COMMIT',body}))}));
  const before=r.nodes[1].head;pbft.message(r.context(r.nodes[1]),{type:'COMMITTED',body:{block,view:0,sequence:1,commits}} as any);
  assert.equal(r.nodes[1].head,before);assert.equal(r.nodes[1].pbft.certificates.size,0);
});

test('PBFT : les suiveurs en ligne ne remplacent pas les votants absents',()=>{
  const blocked=new Simulation({...fast,protocol:'pbft',nodeCount:10,consensusNodes:[0,1,2,3],offlineNodes:[0,1]});blocked.run();assert.equal(blocked.metrics().finalizedHeight,0);
  const working=new Simulation({...fast,protocol:'pbft',nodeCount:10,consensusNodes:[0,1,2,3],offlineNodes:[4,5,6,7,8,9]});working.run();assert.ok(working.metrics().finalizedHeight>0);
});

test('PBFT : rotation parmi les votants, les identités suiveuses sont sautées',()=>{
  const s=new Simulation({...fast,duration:24000,protocol:'pbft',nodeCount:10,consensusNodes:[2,4,6,8],attack:'byzantine',attackStart:0,faultyNodes:1});s.run();
  assert.ok(s.trace.some(e=>e.type==='BYZANTINE_SILENCE'&&e.node==='n2'));assert.ok(s.trace.some(e=>e.type==='VIEW_CHANGED'&&e.data.leader==='n4'));assert.ok(s.metrics().finalizedHeight>0);
});
