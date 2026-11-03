import type { Config, Metrics, Protocol, Snapshot } from '../../core/types.js';
export interface Result { protocol: Protocol; config: Config; metrics: Metrics; termination: Snapshot['termination'] }
export interface Finding { protocol: Protocol; title: string; evidence: string; interpretation: string; boundary: string }
export const fmt = (n: number, digits = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits });
export const secs = (n: number | null) => n === null ? 'Non atteint' : `${fmt(n / 1000, 2)} s`;
export function findings(results: Result[]): Finding[] {
  return results.map(r => {
    const m = r.metrics, finished = r.termination === 'duration';
    const evidence = `${m.settledTransactions}/${m.transactions} transactions au critère ; délai médian ${secs(m.medianSettlement)} ; ${fmt(m.messages)} messages envoyés.`;
    if (!finished) return { protocol: r.protocol, title: 'Mesure incomplète', evidence, interpretation: 'La limite de trace a arrêté cette exécution. Aucune supériorité ne peut être déduite de cette ligne.', boundary: 'Réduire la durée ou la charge, puis relancer.' };
    if (r.protocol === 'pbft') return { protocol: r.protocol, title: 'Décisions entre partenaires identifiés', evidence, interpretation: `Un petit consortium (écoles, banques partenaires, traçabilité partagée) peut privilégier un engagement explicite par quorum. Le tableau montre ici ${secs(m.medianSettlement)} au critère d’engagement et son coût de communication.`, boundary: 'Identités fixes, n = 3f + 1 et au plus f fautes. Ce modèle ne mesure pas un réseau public à grande échelle.' };
    if (r.protocol === 'pos') return { protocol: r.protocol, title: 'Participation pondérée par la mise', evidence, interpretation: m.medianSettlement === null ? 'Aucune transaction n’a atteint la finalité pendant cette exécution. Examiner les votes, le quorum et la durée avant de retenir cette configuration.' : `Un système où le poids de validation dépend de la mise peut privilégier PoS. Le tableau distingue l’inclusion (${secs(m.medianInclusion)}) de la finalité par checkpoints (${secs(m.medianSettlement)}).`, boundary: 'Modèle inspiré de Gasper : quorum ≥ 2/3 de la mise totale. Comités, sanctions économiques et consommation électrique ne sont pas simulés.' };
    return { protocol: r.protocol, title: 'Participation par puissance de calcul', evidence, interpretation: `PoW convient à l’étude d’une participation ouverte fondée sur une ressource de calcul et d’une confirmation probabiliste. Ici, ${m.reorgs} réorganisation(s) et un délai médian de ${secs(m.medianSettlement)} à ${r.config.confirmations} confirmations illustrent le compromis d’attente.`, boundary: 'La chaîne au travail cumulé supérieur gagne ; les confirmations ne garantissent pas une finalité absolue. Le coût énergétique et la difficulté réelle ne sont pas mesurés.' };
  });
}
export function comparisonSummary(results: Result[]): string {
  if (results.length !== 3 || results.some(r => r.termination !== 'duration')) return 'Les trois exécutions doivent être terminées pour établir une comparaison complète.';
  const reachable = results.filter(r => r.metrics.medianSettlement !== null).sort((a, b) => a.metrics.medianSettlement! - b.metrics.medianSettlement!);
  const light = [...results].sort((a, b) => a.metrics.messages - b.metrics.messages)[0];
  const spread = Math.max(...results.map(r => r.metrics.tps)) - Math.min(...results.map(r => r.metrics.tps));
  const tied = reachable.length > 1 && reachable[0].metrics.medianSettlement === reachable[1].metrics.medianSettlement;
  const quickest = reachable.length ? `${tied ? 'Plusieurs modèles partagent le délai minimal' : reachable[0].protocol.toUpperCase() + ' atteint le plus court délai médian au critère'} (${secs(reachable[0].metrics.medianSettlement)}).` : 'Aucun critère de décision n’a été atteint.';
  return `${quickest} ${light.protocol.toUpperCase()} envoie le moins de messages (${fmt(light.metrics.messages)}). ${spread < .05 ? 'Les débits proches peuvent surtout refléter la charge injectée, pas la capacité maximale.' : 'Les débits diffèrent dans ces conditions de charge.'} Les critères (confirmations, finalité, engagement) offrent des garanties différentes : il n’y a pas de gagnant universel.`;
}
