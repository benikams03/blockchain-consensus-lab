import { useState } from 'react';
import { Mining } from './advanced/Mining.js';
import { Staking } from './advanced/Staking.js';
import { Replay, type RunRecord } from './advanced/Replay.js';
import { Experiments } from './advanced/Experiments.js';
import { Distributed } from './advanced/Distributed.js';
import { Icon } from '../components/ui.js';
const tabs = [['mining', 'bolt', 'Miner'], ['staking', 'shield', 'Miser'], ['replay', 'clock', 'Relire'], ['experiments', 'chart', 'Mesurer'], ['distributed', 'network', 'Distribuer']] as const;
export function AdvancedPage({ active, capture }: { active: boolean; capture: () => Promise<RunRecord> }) {
  const [tab, setTab] = useState<string>('mining');
  return <section className="view-content advanced-page"><div className="advanced-hero"><div><span className="eyebrow">L’ATELIER AVANCÉ · ÉDITION FUSION 4</span><h1>Du mécanisme invisible<br/><em>à la preuve observable.</em></h1><p>Cherchez un nonce. Immobilisez une mise. Remontez une décision.<br/>Puis confrontez vos hypothèses aux expériences.</p></div><span className="advanced-stamp">V4<small>comprendre par la preuve</small></span></div><div className="advanced-tabs" role="tablist" aria-label="Modules avancés">{tabs.map(([id, icon, label]) => <button role="tab" tabIndex={tab === id ? 0 : -1} onKeyDown={e => { const i = tabs.findIndex(t => t[0] === id); const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1; if (next >= 0) { e.preventDefault(); setTab(tabs[next][0]); document.getElementById(`tab-${tabs[next][0]}`)?.focus(); } }} id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} key={id} onClick={() => setTab(id)}><Icon name={icon}/>{label}</button>)}</div>
    <div role="tabpanel" id="panel-mining" aria-labelledby="tab-mining" hidden={tab !== 'mining'}><Mining active={active && tab === 'mining'}/></div>
    <div role="tabpanel" id="panel-staking" aria-labelledby="tab-staking" hidden={tab !== 'staking'}><Staking active={active && tab === 'staking'}/></div>
    <div role="tabpanel" id="panel-replay" aria-labelledby="tab-replay" hidden={tab !== 'replay'}><Replay capture={capture}/></div>
    <div role="tabpanel" id="panel-experiments" aria-labelledby="tab-experiments" hidden={tab !== 'experiments'}><Experiments/></div>
    <div role="tabpanel" id="panel-distributed" aria-labelledby="tab-distributed" hidden={tab !== 'distributed'}><Distributed/></div>
  </section>;
}
