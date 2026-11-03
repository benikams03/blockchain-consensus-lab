import { workerUrl } from '../features/workers.js';
import { useEffect, useRef, useState } from 'react';
import { scaleLinear } from 'd3';
import type { Config, Protocol } from '../../core/types.js';
import { comparisonSummary, findings, fmt, secs, type Result } from '../features/comparison.js';
import { download, Icon } from '../components/ui.js';

const measures = {
  messages: { label: 'Messages envoyés', unit: 'envois', value: (r: Result) => r.metrics.messages },
  settlement: { label: 'Délai médian au critère', unit: 'secondes', value: (r: Result) => r.metrics.medianSettlement === null ? null : r.metrics.medianSettlement / 1000 },
  inclusion: { label: 'Délai médian d’inclusion', unit: 'secondes', value: (r: Result) => r.metrics.medianInclusion === null ? null : r.metrics.medianInclusion / 1000 },
  tps: { label: 'Débit de transactions retenues', unit: 'tx/s', value: (r: Result) => r.metrics.tps },
};
export function Comparison({ config }: { config: Config }) {
  const [results, setResults] = useState<Result[]>([]), [progress, setProgress] = useState<Protocol | null>(null), [error, setError] = useState('');
  const [metric, setMetric] = useState<keyof typeof measures>('messages');
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const run = () => {
    worker.current?.terminate(); setResults([]); setError(''); setProgress('pow');
    const w = new Worker(new URL(workerUrl('worker.js'), location.origin), { type: 'module' }); worker.current = w;
    w.onmessage = e => {
      if (worker.current !== w) return;
      if (e.data.type === 'progress') setProgress(e.data.protocol);
      if (e.data.type === 'results') { setResults(e.data.results); setProgress(null); w.terminate(); worker.current = null; }
      if (e.data.type === 'error') { setError(e.data.message); setProgress(null); w.terminate(); worker.current = null; }
    };
    w.onerror = () => { setError('La comparaison a été interrompue. Réessayez avec une durée ou une charge plus faible.'); setProgress(null); w.terminate(); worker.current = null; };
    w.postMessage({ config });
  };
  const conditions = results[0]?.config ?? config, selected = measures[metric];
  const scale = scaleLinear().domain([0, Math.max(1, ...results.map(r => selected.value(r) ?? 0))]).range([0, 100]);
  const rows: [string, (r: Result) => string | number][] = [
    ['Blocs retenus', r => r.metrics.blocks], ['Transactions retenues', r => r.metrics.transactions],
    ['Débit retenu (tx/s)', r => fmt(r.metrics.tps, 3)], ['Délai médian d’inclusion', r => secs(r.metrics.medianInclusion)],
    ['Délai médian au critère', r => secs(r.metrics.medianSettlement)], ['Transactions au critère', r => r.metrics.settledTransactions],
    ['Messages envoyés', r => fmt(r.metrics.messages)], ['Messages perdus', r => r.metrics.dropped],
    ['Réorganisations de l’observateur', r => r.metrics.reorgs], ['Transactions non abouties', r => r.metrics.unfinished],
    ['Critère de décision', r => r.protocol === 'pow' ? `${r.config.confirmations} confirmations` : r.protocol === 'pos' ? 'Checkpoint finalisé' : 'Quorum COMMIT'],
    ['Exécution', r => r.termination === 'duration' ? 'Complète' : 'Partielle'],
  ];
  return <section className="view-content"><div className="eyebrow page-eyebrow">MESURER → COMPRENDRE → CHOISIR</div><h1 className="page-title">Trois mécanismes.<br/><em>Des compromis à lire.</em></h1><p className="page-intro">Le tableau donne des mesures. Le diagramme les met en perspective. À vous de relier ces résultats au problème à résoudre.</p>
    <div className="compare-launch panel"><div><span className="mini-label">PROTOCOLE D’EXPÉRIENCE COMMUN</span><p>7 participants honnêtes, aucun suiveur · seed {config.seed} · {config.duration / 1000} s · {config.latencyMin}–{config.latencyMax} ms</p><small>Même charge et capacité. Rythmes propres conservés : PoW {config.blockInterval / 1000} s, PoS {config.slotDuration / 1000} s/créneau ; PBFT avance par échanges.</small></div><button className="primary-btn" onClick={run} disabled={!!progress}>{progress ? <i className="spinner"/> : <Icon name="chart"/>}{progress ? `Calcul ${progress.toUpperCase()}…` : 'Comparer les 3 consensus'}</button></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {!results.length && !progress && <div className="empty-state"><Icon name="chart"/><h3>Une bonne conclusion commence par une mesure.</h3><p>Lancez les trois simulations, puis comparez les délais de décision et le coût des échanges.</p><span className="tag">Aucun classement universel</span></div>}
    {!!results.length && <>
      <div className="results-heading"><div><span className="mini-label">RÉSULTATS DE CETTE EXÉCUTION</span><p>Seed {conditions.seed} · {conditions.duration / 1000} s · {conditions.latencyMin}–{conditions.latencyMax} ms · charge ≈ {fmt(1000 / conditions.txInterval, 3)} tx/s</p></div><button className="outline-btn" onClick={() => download({ modelVersion: 'atelier-fusion-4.1.0', results, interpretation: findings(results), conclusion: comparisonSummary(results) }, 'consensus-comparaison.json')}><Icon name="export"/>Exporter</button></div>
      <div className="panel comparison-table table-wrap"><table className="data-table"><caption>Mesures de l’observateur honnête fixe de chaque simulation</caption><thead><tr><th scope="col">Mesure</th>{results.map(r => <th scope="col" key={r.protocol}><span className={`protocol-dot ${r.protocol}`}/>{r.protocol.toUpperCase()}</th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{results.map(r => <td key={r.protocol}>{value(r)}</td>)}</tr>)}</tbody></table></div>
      <div className="comparison-reading"><section className="panel chart-panel"><div className="panel-head"><h2 className="panel-title"><Icon name="chart"/>Lire le diagramme</h2><span className="tag">ÉCHELLE LINÉAIRE</span></div><div className="chart-body"><label className="sr-only" htmlFor="chart-metric">Mesure du diagramme</label><select id="chart-metric" className="field" value={metric} onChange={e => setMetric(e.target.value as keyof typeof measures)}>{Object.entries(measures).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select><p className="axis-label">0 → {fmt(scale.domain()[1], 2)} {selected.unit}</p>{results.map(r => { const value = selected.value(r); return <div className={`horizontal-bar ${r.protocol}`} key={r.protocol}><div><strong>{r.protocol.toUpperCase()}</strong><span>{value === null ? 'Non atteint' : `${fmt(value, 2)} ${selected.unit}`}</span></div><div className="bar-track"><div style={{ width: `${value === null ? 0 : scale(value)}%` }}/></div></div>; })}<p className="setting-help">Envois dirigés, retransmissions comprises. Les délais portent sur les transactions ayant atteint le critère ; lire aussi les non abouties.</p></div></section>
      <section className="reading-note"><span className="mini-label">CE QUE CES RÉSULTATS PERMETTENT DE DIRE</span><h2>La vitesse ne dit<br/><em>pas toute la confiance.</em></h2><p>{comparisonSummary(results)}</p><div className="note-rule">Une seed décrit une expérience. Répéter plusieurs graines permet d’évaluer sa variabilité.</div></section></div>
      <div className="section-heading"><span className="eyebrow">DU RÉSULTAT AU CAS D’USAGE</span><h2>Quel consensus pour quel besoin ?</h2><p>Les mesures appuient les observations ci-dessous ; les conditions d’usage viennent aussi des règles du protocole.</p></div>
      <div className="recommendation-grid">{findings(results).map(f => <article className={`recommendation ${f.protocol}`} key={f.protocol}><span className="recommendation-protocol">{f.protocol.toUpperCase()}</span><h3>{f.title}</h3><p className="evidence">{f.evidence}</p><p>{f.interpretation}</p><details><summary>Conditions & limites</summary><p>{f.boundary}</p></details></article>)}</div>
      <p className="comparison-caution">Ces mesures pédagogiques ne constituent pas un benchmark Bitcoin ou Ethereum. Ni l’énergie, ni les coûts économiques, ni une attaque réelle ne sont mesurés. Des critères différents ne deviennent pas équivalents parce qu’ils figurent dans la même colonne.</p>
    </>}
  </section>;
}
