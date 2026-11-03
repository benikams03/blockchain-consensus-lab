import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Simulation,FUSION_MODEL} from '../build/src/fusion/engine.js';
import {SCENARIOS,ADDITIONAL_SCENARIOS} from '../build/src/web/features/scenarios.js';
import {verifyPublicCertificate} from '../build/src/fusion/verification.js';
import {anchorPayload} from '../build/src/blockchain/anchor.js';
await mkdir('artifacts/v4',{recursive:true});const results=[];
for(const scene of [...SCENARIOS,...ADDITIONAL_SCENARIOS]){
  const s=new Simulation(scene.config);s.run();const e=s.export(),i=e.snapshot.inspection;
  assert.equal(e.snapshot.termination,'duration');assert.equal(e.snapshot.time,scene.config.duration);
  assert.equal(e.metrics.protocol,undefined);assert.ok(e.snapshot.nodes.every(n=>Object.values(n.ledger).reduce((sum,a)=>sum+a.balance,0)===scene.config.accountCount*1000));
  for(const cert of i.certificates.slice(-1))assert.equal(verifyPublicCertificate(e,cert.id).valid,true);
  const proof=anchorPayload(e),r={id:scene.id,title:scene.title,config:scene.config,metrics:e.metrics,termination:e.snapshot.termination,
    votes:i.votes.length,certificates:i.certificates.length,evidence:i.evidence.length,traceHash:proof.traceHash,
    keyEvents:e.trace.filter(x=>['MERCHANT_ACCEPTED','PRIVATE_CHAIN_RELEASED','DOUBLE_SPEND_SUCCEEDED','VIEW_CHANGED'].includes(x.type)).map(x=>({time:x.time,type:x.type,node:x.node}))};
  results.push(r);console.log(`${scene.id}: ${e.metrics.blocks} blocs, ${e.metrics.transactions} tx, finalité ${e.metrics.finalizedHeight}, ${i.evidence.length} preuves`);
  if(['honest','resilience','leader','double'].includes(scene.id))await writeFile(`artifacts/v4/exemple-${scene.id}.json`,JSON.stringify(e));
}
await writeFile('artifacts/v4/scenarios-results.json',JSON.stringify({modelVersion:FUSION_MODEL,results},null,2));
console.log(`${results.length} scénarios validés ; rapports et mesures dans artifacts/v4.`);
