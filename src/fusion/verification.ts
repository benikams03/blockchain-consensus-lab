import { isFusionModel } from './model.js';
import { consensusIndices, resourceWeights } from '../core/participants.js';
import { configuration } from '../core/config.js';
import { hash, verify } from '../core/primitives.js';
import { verifyCertificate } from './vendor/consensus/pos/src/adapter.js';
import { verifyPosBlock } from './vendor/consensus/pos/src/validation.js';
import { hash as proofHash, makeDomain, verifyMessage } from './vendor/core/src/crypto.js';
import type { Certificate, LocalView, ModuleContext } from './vendor/contracts/src/index.js';

/** Verifies public signatures and quorum against the declared configuration, never the truth of off-chain execution. */
export function verifyPublicCertificate(input: unknown, id: string): { valid: boolean; text: string } {
  try {
    const e = input as any;
    if (!isFusionModel(e?.modelVersion) || !e.config || !e.snapshot || typeof id !== 'string') throw new Error('Rapport Fusion v4 attendu.');
    const declared = configuration(e.config);
    if (e.config.protocol === 'pbft') {
      const members = consensusIndices(e.config).map(i=>'n'+i);
      if (![4,7,10].includes(members.length)) throw new Error('Comité PBFT invalide.');
      const candidates = e.pbftCertificates;
      if (!Array.isArray(candidates) || candidates.length > 10000) throw new Error('Certificats absents ou excessifs.');
      const cert = candidates.find((c: any) => hash({ view: c.view, sequence: c.sequence, block: c.block.id, commits: c.commits.map((m: any) => m.signature).sort() }) === id);
      if (!cert || !Array.isArray(cert.commits) || cert.commits.length > members.length) throw new Error('Certificat absent.');
      const domain = hash({ model: 'atelier-1.0.0', config: e.config }), signers = new Set<string>();
      for (const m of cert.commits) {
        if (!members.includes(m.from) || !/^n\d+$/.test(m.from) || Number(m.from.slice(1)) >= e.config.nodeCount || signers.has(m.from) || m.type !== 'COMMIT'
          || m.body?.view !== cert.view || m.body?.sequence !== cert.sequence || m.body?.digest !== cert.block.id
          || !verify(m.from, { domain, from: m.from, type: m.type, body: m.body }, m.signature)) throw new Error('COMMIT invalide ou identité dupliquée.');
        signers.add(m.from);
      }
      const quorum = 2 * (members.length - 1) / 3 + 1;
      if (signers.size < quorum) throw new Error('Quorum insuffisant.');
      return { valid: true, text: `${signers.size} signatures COMMIT distinctes vérifiées ; quorum ${quorum}, vue ${cert.view}, séquence ${cert.sequence}.` };
    }
    if (e.config.protocol !== 'pos') throw new Error('Un certificat PoS ou PBFT est attendu.');
    const p = e.proofRecord, list = p?.certificates as Certificate[];
    if (!p?.config || !Array.isArray(p.blocks) || p.blocks.length > 10000 || !Array.isArray(list) || list.length > 10000) throw new Error('Preuves PoS absentes ou excessives.');
    const weights = resourceWeights(declared);
    if (!Array.isArray(p.config.validators) || p.config.validators.length !== declared.nodeCount || p.config.validators.some((n: any,i: number)=>n.id !== 'n'+i || n.stake !== weights[i])) throw new Error('Le comité ou les mises déclarés ne correspondent pas aux preuves signées.');
    const blocks = new Map<string, any>(), initial = new Map(Object.entries(p.genesisLedger)), keys = new Map<string, string>(Object.entries(p.accountPublicKeys));
    const root = proofHash(['genesis-state-v1', [...initial].map(([account, a]: [string, any]) => [account, a.balance, a.nextNonce, keys.get(account)])]);
    if (p.domain !== makeDomain(p.genesis.id, p.config, root)) throw new Error('Le domaine signé ne correspond pas aux mises et à l’état initial déclarés.');
    blocks.set(p.genesis.id, p.genesis);
    for (const b of [...p.blocks].sort((a: any, b: any) => a.header.height - b.header.height)) {
      if (b.id === p.genesis.id) continue;
      if (!verifyPosBlock(b, blocks, p.config, initial as any, keys, e.snapshot.time)) throw new Error('Un bloc public ne passe pas la validation.'); blocks.set(b.id, b);
    }
    const view: LocalView = { nodeId: p.config.validators[0].id, nowMs: e.snapshot.time, config: p.config, domain: p.domain, genesisId: p.genesis.id, blocks, headId: p.genesis.id, mempool: [] };
    const ctx = { hash: proofHash, verify: (m: any) => verifyMessage(m, p.config, p.domain) } as ModuleContext;
    const justified = new Map([['0:' + p.genesis.id, { epoch: 0, blockId: p.genesis.id }]]);
    const verified = new Set<string>(); let progress = true;
    while (progress) { progress = false; for (const cert of list) {
      if (verified.has(cert.id) || cert.votes.length > p.config.validators.length) continue;
      if (verifyCertificate(cert, view, justified, ctx)) { verified.add(cert.id); justified.set(`${cert.target.epoch}:${cert.target.blockId}`, cert.target); progress = true; }
    } }
    if (!verified.has(id)) throw new Error('Signatures, checkpoint, source justifiée ou quorum invalides.');
    const cert = list.find(c => c.id === id)!, weight = cert.votes.reduce((s, v) => s + p.config.validators.find((n: any) => n.id === v.signerId).stake, 0);
    return { valid: true, text: `${cert.votes.length} signatures distinctes vérifiées ; ${weight}/${p.config.validators.reduce((s: number, n: any) => s + n.stake, 0)} unités de mise, source justifiée et checkpoints vérifiés.` };
  } catch (error) { return { valid: false, text: (error as Error).message }; }
}
