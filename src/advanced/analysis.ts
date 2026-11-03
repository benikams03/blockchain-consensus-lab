import type { Config, Metrics, Observation, Snapshot } from '../core/types.js';
import { Simulation } from '../core/engine.js';
import { Simulation as Fusion } from '../fusion/engine.js';
import { isFusionModel } from '../fusion/model.js';
import { consensusIndices } from '../core/participants.js';
export interface Sample { seed: number; protocol: Config['protocol']; metrics: Metrics; termination: Snapshot['termination']; config: Config }
export function percentile(values: number[], p: number) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]; }
export function wilson(success: number, total: number): [number, number] | null {
  if (!total) return null; const z = 1.95996398454, p = success / total, d = 1 + z * z / total, c = (p + z * z / (2 * total)) / d, h = z / d * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)); return [Math.max(0, c - h), Math.min(1, c + h)];
}
export function aggregate(samples: Sample[]) {
  return (['pow', 'pos', 'pbft'] as const).filter(p => samples.some(s => s.protocol === p)).map(protocol => {
    const group = samples.filter(s => s.protocol === protocol), complete = group.filter(s => s.termination === 'duration'), successful = complete.filter(s => s.metrics.doubleSpend === 'success').length;
    return { protocol, trials: group.length, complete: complete.length, partial: group.length - complete.length, tpsMedian: percentile(complete.map(s => s.metrics.tps), .5), inclusionMedian: percentile(complete.map(s => s.metrics.medianInclusion).filter((x): x is number => x !== null), .5), settlementMedian: percentile(complete.map(s => s.metrics.medianSettlement).filter((x): x is number => x !== null), .5), noSettlement: complete.filter(s => s.metrics.medianSettlement === null).length, messagesMedian: percentile(complete.map(s => s.metrics.messages), .5), tpsP10: percentile(complete.map(s => s.metrics.tps), .1), tpsP90: percentile(complete.map(s => s.metrics.tps), .9), successful, successInterval: complete.some(s => s.config.attack === 'double') ? wilson(successful, complete.length) : null };
  });
}
export function explainEvent(event: Observation, config: Config, catalog: Snapshot['blocks']): { title: string; reason: string; evidence: string } {
  const d = event.data, node = event.node?.toUpperCase() ?? 'Réseau', committee = consensusIndices(config).length, f = (committee - 1) / 3;
  switch (event.type) {
    case 'HEAD_CHANGED': { const b = catalog.find(b => b.id === d.head); return { title: `${node} ${d.removed?.length ? 'réorganise sa chaîne' : 'adopte une tête'}`, reason: config.protocol === 'pow' ? 'La politique PoW retient la branche au travail cumulé strictement supérieur ; une égalité conserve la tête. Une proposition locale peut aussi devenir la nouvelle tête.' : config.protocol === 'pos' ? 'Le choix de tête part du checkpoint justifié compatible avec la finalité, puis suit les derniers votes pondérés.' : 'L’adoption PBFT est conditionnée par un certificat d’engagement vérifié.', evidence: `Hauteur ${d.height} ; travail cumulé du bloc ${b?.work ?? 'inconnu'} ; ${d.removed?.length ?? 0} bloc(s) retiré(s), ${d.added?.length ?? 0} ajouté(s).` }; }
    case 'CHECKPOINT_JUSTIFIED': case 'CHECKPOINT_FINALIZED': return { title: event.type === 'CHECKPOINT_FINALIZED' ? 'Un checkpoint devient finalisé' : 'Un checkpoint devient justifié', reason: 'Un lien vérifié représente au moins deux tiers de la mise totale. Un lien entre époques adjacentes permet de finaliser sa source déjà justifiée.', evidence: `${node} · époque ${d.epoch} · ${d.votes} identités votantes. Les certificats et signatures de Fusion v4 sont consultables dans le laboratoire.` };
    case 'BLOCK_COMMITTED_LOCAL': return { title: `${node} engage un bloc`, reason: `Avec ${config.nodeCount} nœuds dont n = ${committee} répliques votantes, f = ${f} : proposition valide, ${2 * f} PREPARE de secours puis ${2 * f + 1} COMMIT distincts sont nécessaires.`, evidence: `Séquence ${d.sequence} · vue ${d.view} · ${d.votes} COMMIT observés dans le certificat.` };
    case 'VIEW_CHANGED': return { title: 'Un nouveau leader est installé', reason: 'Le délai de progression a expiré ; un changement de vue certifié préserve la valeur préparée pertinente.', evidence: `${node} · vue ${d.view} · leader ${d.leader}.` };
    case 'MERCHANT_ACCEPTED': return { title: 'Le marchand livre', reason: `Son paiement est dans la branche de l’observateur et atteint ${config.confirmations} confirmations. Il accepte encore un risque de réorganisation.`, evidence: `${config.confirmations} confirmations exigées · livraison à ${(event.time / 1000).toFixed(3)} s.` };
    case 'DOUBLE_SPEND_SUCCEEDED': return { title: 'La double dépense satisfait notre critère', reason: 'Une livraison a eu lieu, le paiement n’est plus retenu et la transaction conflictuelle a atteint les confirmations demandées.', evidence: `Paiement ${d.payment} ; conflit ${d.conflict}.` };
    case 'PRIVATE_CHAIN_RELEASED': return { title: 'La branche privée devient publique', reason: 'Les blocs sont diffusés après rétention. Leur adoption reste soumise à la réception, à la validation et au travail cumulé.', evidence: `${node} publie ${d.blocks} bloc(s) à ${(event.time / 1000).toFixed(3)} s.` };
    default: return { title: `${node} · ${event.type}`, reason: 'Cette observation provient d’un événement du moteur. Elle ne constitue pas un vote supplémentaire ni une instruction donnée aux nœuds.', evidence: JSON.stringify(d) };
  }
}
export function replay(config: Config, sequence: number, modelVersion = 'atelier-1.0.0') {
  const sim = isFusionModel(modelVersion) ? new Fusion(config) : new Simulation(config);
  while (!sim.done && sim.trace.length <= sequence) sim.step();
  return sim.snapshot();
}
