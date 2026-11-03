const assert = require('node:assert/strict');
const hre = require('hardhat');
const { BrowserProvider, ContractFactory, keccak256, toUtf8Bytes, ZeroHash } = require('ethers');
const { mkdirSync, writeFileSync } = require('node:fs');
describe('ResultsRegistry V2 : PoW, PoS et PBFT', function () {
  let provider, alice, bob, registry; const gas = {};
  const digest = s => keccak256(toUtf8Bytes(s));
  const fields = () => [digest('rapport-public'),2,4,9,8,7,24000];
  before(async () => { provider=new BrowserProvider(hre.network.provider); provider.pollingInterval=10; alice=await provider.getSigner(0); bob=await provider.getSigner(1); });
  beforeEach(async () => { const a=await hre.artifacts.readArtifact('ResultsRegistry'); registry=await new ContractFactory(a.abi,a.bytecode,alice).deploy(); await registry.waitForDeployment(); gas.deployment=String((await registry.deploymentTransaction().wait()).gasUsed); });
  after(() => { mkdirSync('artifacts',{recursive:true}); writeFileSync('artifacts/contracts-gas.json',JSON.stringify({network:'Hardhat local 31337',compiler:'0.8.28',optimizerRuns:200,evmVersion:'paris',gas},null,2)); });
  it('identifiant de version V2, état initial et lecture absente', async () => {
    assert.equal(await registry.REGISTRY_ID(),digest('UNIKIN_CONSENSUS_RESULTS_V2')); assert.equal(await registry.totalRecords(),0n); assert.equal(await registry.verify(ZeroHash,digest('absent')),false); await assert.rejects(registry.getResult(ZeroHash));
  });
  it('enregistrement immuable, auteur authentique, résumé et événement', async () => {
    const p=fields(), receipt=await(await registry.recordRun(...p)).wait(); gas.record=String(receipt.gasUsed); const id=await registry.resultId(await alice.getAddress(),p[0]), value=await registry.getResult(id);
    assert.equal(value.publisher,await alice.getAddress()); assert.equal(value.protocol,2n); assert.equal(value.nodes,4n); assert.equal(value.traceHash,p[0]); assert.equal(value.secured,7n);
    assert.ok(receipt.logs.some(log=>{try{return registry.interface.parseLog(log)?.name==='ResultRecorded';}catch{return false;}}));
    assert.equal(await registry.verify(id,p[0]),true); assert.equal(await registry.verify(id,digest('altéré')),false); assert.equal(await registry.recordedAt(id),BigInt((await provider.getBlock(receipt.blockNumber)).timestamp));
  });
  it('bornes et incohérences refusées, PBFT accepté, protocole 3 refusé', async () => {
    for(const [index,value] of [[0,ZeroHash],[1,3],[2,0],[2,65],[3,0],[3,1001],[4,1001],[5,9],[6,0],[6,2592000001]]) {const p=fields();p[index]=value;await assert.rejects(registry.recordRun.staticCall(...p));}
    assert.equal(await registry.totalRecords(),0n);
  });
  it('doublon refusé et impossible écrasement par un autre compte', async () => {
    const p=fields();await(await registry.recordRun(...p)).wait();await assert.rejects(registry.recordRun.staticCall(...p));
    const changed=[...p];changed[5]=0;await(await registry.connect(bob).recordRun(...changed)).wait();const a=await registry.resultId(await alice.getAddress(),p[0]),b=await registry.resultId(await bob.getAddress(),p[0]);
    assert.notEqual(a,b);assert.equal((await registry.getResult(a)).secured,7n);assert.equal((await registry.getResult(b)).secured,0n);
  });
  it('aucun ETH reçu, aucune méthode payable', async () => {await assert.rejects(alice.sendTransaction({to:await registry.getAddress(),value:1n}));await assert.rejects(registry.recordRun(...fields(),{value:1n}));assert.equal(await provider.getBalance(await registry.getAddress()),0n);});
  it('les rapports réellement produits par les trois moteurs peuvent être ancrés', async () => {
    const {Simulation}=await import('../../build/src/fusion/engine.js');const {anchorPayload,argumentsFor}=await import('../../build/src/blockchain/anchor.js');
    for(const protocol of ['pow','pos','pbft']) {const s=new Simulation({protocol,nodeCount:4,accountCount:4,transactionCount:3,duration:12000,attackStart:1000,releaseAt:9000,latencyMin:10,latencyMax:30,blockInterval:1000,slotDuration:1000,epochLength:2});s.run();const p=anchorPayload(s.export());
      assert.ok(p.transactions>0);const r=await(await registry.recordRun(...argumentsFor(p))).wait();gas[protocol]=String(r.gasUsed);assert.equal(await registry.verify(await registry.resultId(await alice.getAddress(),p.traceHash),p.traceHash),true);
    } assert.equal(await registry.totalRecords(),3n);
  });
  it('rapport incomplet, partiel et altération : détection avant ou après enregistrement', async () => {
    const {Simulation}=await import('../../build/src/fusion/engine.js');const {anchorPayload,canonicalJson,argumentsFor}=await import('../../build/src/blockchain/anchor.js');const s=new Simulation({duration:12000,attackStart:1000,releaseAt:9000,transactionCount:3,nodeCount:3});
    assert.throws(()=>anchorPayload(s.export()));s.run();const report=s.export(),p=anchorPayload(report);await(await registry.recordRun(...argumentsFor(p))).wait();
    const inconsistent=structuredClone(report);inconsistent.config.seed++;assert.throws(()=>anchorPayload(inconsistent),/incohérents/);
    const changed=structuredClone(report);changed.trace[0].data.altered=true;const q=anchorPayload(changed);assert.notEqual(q.traceHash,p.traceHash);assert.equal(await registry.verify(await registry.resultId(await alice.getAddress(),p.traceHash),q.traceHash),false);
    assert.equal(canonicalJson({z:2,a:1}),'\u007b"a":1,"z":2\u007d');const partial=structuredClone(report);partial.snapshot.termination='event-limit';assert.throws(()=>anchorPayload(partial));
  });
});
