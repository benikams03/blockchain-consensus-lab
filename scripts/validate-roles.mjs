import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Simulation,FUSION_MODEL} from '../build/src/fusion/engine.js';
import {verifyPublicCertificate} from '../build/src/fusion/verification.js';
import {anchorPayload} from '../build/src/blockchain/anchor.js';
const dir='artifacts/v4.1';await mkdir(dir,{recursive:true});const rows=[];
for(const protocol of ['pow','pos','pbft']){
  const c={protocol,nodeCount:10,consensusNodes:protocol==='pbft'?[0,1,2,3]:[0,1,2],accountCount:6,transactionCount:8,
    duration:24000,attackStart:3000,releaseAt:15000,latencyMin:30,latencyMax:120,slotDuration:1500,epochLength:4,blockInterval:1500,seed:42};
  const s=new Simulation(c);s.run();const e=s.export(),followers=e.snapshot.nodes.filter(n=>!n.participates);
  assert.equal(e.snapshot.termination,'duration');assert.ok(followers.every(n=>n.height>0));
  if(protocol!=='pow')assert.equal(verifyPublicCertificate(e,e.snapshot.inspection.certificates.at(-1).id).valid,true);
  const p=anchorPayload(e);rows.push({protocol,networkNodes:e.config.nodeCount,participants:e.config.consensusNodes.length,followers:followers.length,
    quorum:protocol==='pbft'?2*(e.config.consensusNodes.length-1)/3+1:null,config:e.config,metrics:e.metrics,traceHash:p.traceHash});
  await writeFile(`${dir}/exemple-roles-${protocol}.json`,JSON.stringify(e));console.log(`${protocol}: ${e.config.nodeCount} nœuds, ${e.config.consensusNodes.length} participants, ${followers.length} suiveurs ; ${e.metrics.blocks} blocs.`);
}
await writeFile(`${dir}/roles-results.json`,JSON.stringify({modelVersion:FUSION_MODEL,results:rows},null,2));
