import { useEffect, useRef, type ReactNode } from 'react';
import type { Observation, Protocol } from '../../core/types.js';
export const nodeRole = (protocol: Protocol, participates: boolean) => !participates ? 'Nœud suiveur' : protocol==='pow' ? 'Mineur' : protocol==='pos' ? 'Validateur' : 'Réplique votante';
export const names: Record<Protocol, string> = { pow: 'Preuve de travail', pos: 'Preuve d’enjeu', pbft: 'Accord byzantin' };
const paths: Record<string, string> = {
  flask: 'M9 3h6M10 3v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8',
  chart: 'M4 20h17M7 16V9M12 16V4M17 16v-5', network: 'M12 8v6M5 18h14M5 18v-4h14v4M9 3h6v5H9zM2 18h6v4H2zM16 18h6v4h-6z',
  layers: 'm12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5', book: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4zM12 6v16',
  play: 'm9 5 11 7-11 7V5z', pause: 'M8 5v14M16 5v14', step: 'm5 5 10 7-10 7V5zM19 5v14', reset: 'M3 10a9 9 0 1 1 1 8M3 4v6h6',
  export: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zM8 12l3 3 5-6', bolt: 'm13 2-9 12h7l-1 8 10-13h-7l1-7z',
  arrow: 'M5 12h14m-5-5 5 5-5 5', settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  fork: 'M6 3v12a5 5 0 0 0 5 5h1M18 3v4a5 5 0 0 1-5 5H6', check: 'm5 12 4 4L19 6', palette: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-3-4-6-9-6z',
};
export function Icon({ name }: { name: string }) { return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] ?? paths.info}/></svg>; }
export function Brand() { return <><span className="brand-mark"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M8 22 15 8l8 14Z" stroke="currentColor" fill="none" strokeWidth="1.5"/><circle cx="15" cy="8" r="3" fill="currentColor"/><circle cx="8" cy="22" r="3" fill="currentColor"/><circle cx="23" cy="22" r="3" fill="currentColor"/></svg></span><span className="brand-name">consensus<span>ATELIER</span></span></>; }
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === ref.current) close(); }} aria-labelledby="dialog-title"><button className="dialog-close" onClick={close} aria-label="Fermer">×</button><h2 id="dialog-title">{title}</h2>{children}</dialog>;
}
export function download(value: unknown, file: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function eventText(e: Observation) {
  const d = e.data, n = e.node?.toUpperCase() ?? 'Réseau';
  switch (e.type) {
    case 'BLOCK_PROPOSED': return `${n} propose le bloc #${d.height}.`;
    case 'HEAD_CHANGED': return `${n} ${d.removed?.length ? 'réorganise sa chaîne' : 'adopte le bloc'} #${d.height}.`;
    case 'CHECKPOINT_JUSTIFIED': return `${n} justifie le checkpoint de l’époque ${d.epoch}.`;
    case 'CHECKPOINT_FINALIZED': return `${n} finalise le checkpoint de l’époque ${d.epoch}.`;
    case 'BLOCK_COMMITTED_LOCAL': return `${n} engage le bloc #${d.sequence} avec ${d.votes} COMMIT.`;
    case 'VIEW_CHANGED': return `${n} passe à la vue ${d.view} ; leader ${d.leader}.`;
    case 'VIEW_CHANGE_REQUESTED': return `${n} demande la vue ${d.view}.`;
    case 'PBFT_PHASE': return `${n} : ${d.phase}, vue ${d.view}.`;
    case 'FAULT_EVIDENCE': return `Preuve de faute de ${d.offender} : ${d.kind}.`;
    case 'TX_SUBMITTED': return `${d.from} → ${d.to} : transaction ${d.private ? 'privée' : 'publique'}.`;
    case 'MERCHANT_ACCEPTED': return 'Le marchand livre le bien après les confirmations demandées.';
    case 'DOUBLE_SPEND_SUCCEEDED': return 'Double dépense observée : le paiement livré a été remplacé.';
    case 'PRIVATE_CHAIN_RELEASED': return `${n} révèle ${d.blocks} blocs privés.`;
    case 'ATTACK_STARTED': return 'La perturbation commence.';
    case 'BYZANTINE_SILENCE': return `${n}, leader contrôlé, reste silencieux.`;
    case 'RUN_FINISHED': return 'Expérience terminée : les résultats sont exportables.';
    case 'RUN_LIMIT_REACHED': return 'Limite de trace atteinte : résultat partiel.';
    default: return `${n} · ${e.type}`;
  }
}
export function Journal({ events, full = false }: { events: Observation[]; full?: boolean }) {
  const visible = events.filter(e => !['MESSAGE_SENT', 'MESSAGE_DELIVERED', 'BLOCK_ACCEPTED_LOCAL', 'RUN_CREATED'].includes(e.type)).slice(full ? -250 : -7).reverse();
  return <ul className={`log-list ${full ? 'full-log' : ''}`}>{visible.length ? visible.map(e => <li key={e.seq} className={`log-item ${/FAULT|ATTACK|DOUBLE|PRIVATE|REJECTED/.test(e.type) ? 'warning' : ''}`}><time>{(e.time / 1000).toFixed(1)} s</time><i className="dot"/><span>{eventText(e)}</span></li>) : <li className="log-empty">Lancez la simulation pour voir les premières décisions.</li>}</ul>;
}
