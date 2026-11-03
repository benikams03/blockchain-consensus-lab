import { useLayoutEffect, useRef, useState } from 'react';
import { linkHorizontal } from 'd3';
import type { Block, Snapshot } from '../../core/types.js';
import { nodeRole } from './ui.js';
import { fmt } from '../features/comparison.js';

export function NetworkGraph({ snapshot: s, selected, select }: { snapshot: Snapshot; selected: string; select: (id: string) => void }) {
  const ref = useRef<SVGSVGElement>(null), [compact, setCompact] = useState(false);
  useLayoutEffect(() => { const observer = new ResizeObserver(([e]) => setCompact(e.contentRect.width < 520)); observer.observe(ref.current!); return () => observer.disconnect(); }, []);
  const c = s.config, n = s.nodes.length, cx = compact ? 250 : 360, cy = 153, rx = compact ? 166 : 206, ry = 109;
  const grid = n > 16, columns = compact ? 5 : 8, graphWidth = compact ? 500 : 720, graphHeight = grid ? 140 + Math.ceil(n / columns) * 76 : 320;
  const points = s.nodes.map((node, i) => ({ ...node, x: grid ? 50+(i%columns)*(graphWidth-100)/(columns-1) : cx + Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n) * rx, y: grid ? 130+Math.floor(i/columns)*76 : cy + Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n) * ry }));
  const partition = c.attack === 'partition' && s.time >= c.attackStart && s.time < c.releaseAt;
  const recent = s.events.filter(e => e.type === 'MESSAGE_SENT' && s.time - e.time < 900).slice(-12);
  return <div className="network-wrap"><span className="network-stamp">{partition ? 'PARTITION ACTIVE · DEUX GROUPES' : grid ? 'RÉSEAU COMPLET · LIAISONS DU NŒUD SÉLECTIONNÉ' : 'VUES LOCALES · RÉSEAU COMPLET'}</span><svg ref={ref} className="network-svg" style={grid ? {height:'auto'} : undefined} viewBox={`0 0 ${graphWidth} ${graphHeight}`} role="group" aria-label="Nœuds interactifs : le nombre indique la hauteur locale">
    {!grid && <ellipse className="orbit" cx={cx} cy={cy} rx={rx} ry={ry}/>}
    {points.flatMap((a, i) => points.slice(i + 1).map(b => {
      const cut = partition && ((i < Math.ceil(n / 2)) !== (Number(b.id.slice(1)) < Math.ceil(n / 2)));
      const active = recent.some(e => e.node === a.id && e.data.to === b.id || e.node === b.id && e.data.to === a.id);
      if (grid && a.id !== selected && b.id !== selected && !active) return null;
      return <line key={a.id + b.id} className={`edge ${active ? 'active' : ''} ${cut ? 'cut' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;
    }))}
    <text className="network-center big" x={cx} y={grid ? 55 : cy - 4}>{c.protocol.toUpperCase()}</text><text className="network-center" x={cx} y={grid ? 78 : cy + 19}>{fmt(s.metrics.messages)} messages envoyés</text><text className="network-center role-count" x={cx} y={grid?100:cy+38}>{c.consensusNodes.length} participants · {c.nodeCount-c.consensusNodes.length} suiveurs</text>
    {recent.map(e => { const a = points.find(p => p.id === e.node), b = points.find(p => p.id === e.data.to); if (!a || !b) return null; return <circle key={e.seq} className="packet voting" r="2.8" cx={b.x} cy={b.y}><animate attributeName="cx" from={a.x} to={b.x} dur="0.65s"/><animate attributeName="cy" from={a.y} to={b.y} dur="0.65s"/></circle>; })}
    {points.map(p => <g key={p.id} className={`node ${selected === p.id ? 'selected' : ''}`} transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button" aria-label={`${p.id}, hauteur ${p.height}, ${nodeRole(c.protocol,p.participates)}, ${c.offlineNodes.includes(Number(p.id.slice(1))) ? 'hors ligne' : p.faulty ? 'contrôlé' : 'honnête'}`} aria-pressed={selected === p.id} onClick={() => select(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.id); } }}>
      <circle className="node-circle" r={n > 10 ? 17 : 23} fill={c.offlineNodes.includes(Number(p.id.slice(1))) ? '#d3d6d5' : p.faulty ? '#edc8b6' : !p.participates ? '#dce9f1' : p.id === s.metrics.observer ? '#c6e590' : '#e8efdc'}/><text className="node-inner" textAnchor="middle" y="4">{String(p.height).padStart(2, '0')}</text>
      <text className="node-label" textAnchor="middle" y={n > 10 ? 30 : 39}>{p.id.toUpperCase()}{p.id === s.metrics.observer ? ' · obs.' : ''}</text>
      {n <= 10 && <text className="node-state" textAnchor="middle" y="52">{!p.participates?'suiveur':c.protocol === 'pbft' ? `vue ${p.view}` : c.protocol==='pow'?'mineur':'validateur'}</text>}
    </g>)}
  </svg></div>;
}
export function canonicalIds(s: Snapshot) {
  const ids = new Set<string>(), map = new Map(s.blocks.map(b => [b.id, b]));
  let b = map.get(s.nodes.find(n => n.id === s.metrics.observer)!.head);
  while (b) { ids.add(b.id); b = b.parent ? map.get(b.parent) : undefined; } return ids;
}
export function ChainView({ snapshot: s, inspect }: { snapshot: Snapshot; inspect: (b: Block) => void }) {
  const [showAll, setShowAll] = useState(false);
  const ids = canonicalIds(s), max = Math.max(...s.blocks.map(b => b.height)), start = showAll ? 0 : Math.max(0, max - 8), blocks = s.blocks.filter(b => b.height >= start);
  const width = Math.max(760, (max - start + 1) * 79 + 40);
  const positions = new Map<string, [number, number]>(), perHeight = new Map<number, number>();
  for (const b of blocks) { const row = ids.has(b.id) ? 0 : (perHeight.get(b.height) ?? 0) + 1; if (row) perHeight.set(b.height, row); positions.set(b.id, [28 + (b.height - start) * 79, 26 + row * 55]); }
  const height = Math.max(125, ...Array.from(positions.values()).map(p => p[1] + 58));
  const link = linkHorizontal<unknown, [number, number]>();
  const criterion = s.config.protocol === 'pow' ? s.metrics.confirmedHeight : s.metrics.finalizedHeight;
  return <><div className="chain-view-controls"><span>{showAll ? 'Historique complet · faire défiler horizontalement' : 'Fenêtre sur les dernières hauteurs'}</span><button className="soft-btn" aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'Dernières hauteurs' : 'Tout l’arbre'}</button></div><div className="chain-scroll"><svg className="chain-svg" style={{ minWidth: showAll ? width : 500, height }} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Arbre des blocs : vert retenu, corail concurrent">
    {blocks.filter(b => b.parent && positions.has(b.parent)).map(b => { const a = positions.get(b.parent!)!, p = positions.get(b.id)!; return <path key={b.id} className={`chain-link ${ids.has(b.id) ? '' : 'fork'}`} d={link({ source: [a[0] + 56, a[1] + 19], target: [p[0], p[1] + 19] }) ?? ''}/>; })}
    {blocks.map(b => { const p = positions.get(b.id)!; return <g key={b.id} transform={`translate(${p[0]},${p[1]})`} role="button" tabIndex={0} aria-label={`Bloc ${b.height}, ${ids.has(b.id) ? 'retenu' : 'concurrent'}, ${b.txs.length} transactions`} onClick={() => inspect(b)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(b); } }}><rect className={`block-box ${!ids.has(b.id) ? 'fork' : b.height <= criterion ? 'final' : ''}`} width="56" height="38" rx="8"/><text className="block-text" x="28" y="16" textAnchor="middle">{b.height === 0 ? 'GEN' : `#${String(b.height).padStart(2, '0')}`}</text><text className="block-small" x="28" y="29" textAnchor="middle">{b.txs.length} tx · {b.producer.toUpperCase()}</text></g>; })}
  </svg></div></>;
}
