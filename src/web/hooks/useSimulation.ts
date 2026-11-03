import { useCallback, useEffect, useRef, useState } from 'react';
import { Simulation } from '../../fusion/engine.js';
import { configuration } from '../../core/config.js';
import type { Config, Snapshot } from '../../core/types.js';

interface Remote { base: string; id: string; token: string; socket: WebSocket | null }
export function useSimulation() {
  const engine = useRef<Simulation | null>(null);
  if (!engine.current) engine.current = new Simulation();
  const [snapshot, setSnapshot] = useState<Snapshot>(() => engine.current!.snapshot());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(4);
  const [status, setStatus] = useState('Moteur navigateur');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const remote = useRef<Remote | null>(null), generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandBusy = useRef(false);
  const release = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const r = remote.current; remote.current = null;
    if (r) { r.socket?.close(); await fetch(`${r.base}/api/runs/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${r.token}` } }).catch(() => {}); }
  }, []);
  const command = useCallback(async (name: string, extra: Record<string, number> = {}) => {
    const r = remote.current;
    if (!r) return null;
    const response = await fetch(`${r.base}/api/runs/${r.id}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${r.token}` }, body: JSON.stringify({ command: name, commandId: crypto.randomUUID(), ...extra }) });
    if (!response.ok) throw new Error(`Commande refusée (${response.status})`);
    const s: Snapshot = await response.json();
    if (remote.current === r) { setSnapshot(s); if (s.done) setPlaying(false); }
    return s;
  }, []);
  const attach = useCallback((r: Remote) => {
    const socket = new WebSocket(r.base.replace(/^http/, 'ws') + `/api/runs/${r.id}/stream?token=${r.token}`);
    r.socket = socket;
    socket.onmessage = e => {
      if (remote.current !== r || r.socket !== socket) return;
      try { const data = JSON.parse(e.data); if (data.type === 'snapshot') { setSnapshot(data.snapshot); if (data.snapshot.done) setPlaying(false); } } catch { setError('Message serveur illisible.'); }
    };
    socket.onopen = () => {
      if (remote.current !== r) return;
      // A reconnect pauses the remote run too, so the controls reflect its actual state.
      void command('pause').then(() => {
        if (remote.current === r && r.socket === socket) { setPlaying(false); setStatus('Serveur · WebSocket'); }
      }).catch(e => { setError(e.message); setStatus('Serveur · commande refusée'); });
    };
    socket.onclose = () => {
      if (remote.current !== r || r.socket !== socket) return;
      setPlaying(false); setStatus('Reconnexion au serveur…');
      timer.current = setTimeout(() => { if (remote.current === r) attach(r); }, 2000);
    };
  }, [command]);
  const start = useCallback(async (input: Partial<Config>, base?: string | null) => {
    if (commandBusy.current) return false;
    let c: Config;
    try { c = configuration(input); } catch (e) { setError(`Configuration invalide : ${(e as Error).message}`); return false; }
    const target = base === undefined ? remote.current?.base : base;
    const version = ++generation.current;
    commandBusy.current = true; setBusy(true); setPlaying(false); setError('');
    await release();
    try {
      if (target) {
        const url = new URL(target); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Adresse HTTP(S) attendue.');
        const origin = target.replace(/\/$/, '');
        const res = await fetch(origin + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
        if (!res.ok) throw new Error(`API indisponible (${res.status})`);
        const data = await res.json();
        const r: Remote = { base: origin, id: data.id, token: data.token, socket: null };
        remote.current = r; setSnapshot(data.snapshot); setSpeedState(4); setStatus('Connexion au serveur…'); attach(r);
      } else { engine.current = new Simulation(c); setSnapshot(engine.current.snapshot()); setStatus('Moteur navigateur'); }
      return true;
    } catch (e) {
      if (version === generation.current) { engine.current = new Simulation(c); setSnapshot(engine.current.snapshot()); setStatus('Moteur navigateur'); setError(`${(e as Error).message}. Expérience remise à zéro dans le navigateur.`); }
      return false;
    } finally { commandBusy.current = false; setBusy(false); }
  }, [attach, release]);
  const act = useCallback(async (name: 'toggle' | 'step', nextSpeed?: number) => {
    if (commandBusy.current) return;
    commandBusy.current = true;
    try {
      if (nextSpeed !== undefined) { if (remote.current) await command('speed', { speed: nextSpeed }); setSpeedState(nextSpeed); }
      else if (name === 'toggle') { if (remote.current) await command(playing ? 'pause' : 'play'); setPlaying(!playing); }
      else { if (remote.current) await command('step'); else { engine.current!.step(); setSnapshot(engine.current!.snapshot()); } }
    } catch (e) { setPlaying(false); setError((e as Error).message); }
    finally { commandBusy.current = false; }
  }, [command, playing]);
  useEffect(() => {
    if (!playing || remote.current) return;
    const id = setInterval(() => {
      const sim = engine.current!;
      sim.advance(Math.min(sim.time + 100 * speed, sim.config.duration), 300);
      setSnapshot(sim.snapshot()); if (sim.done) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [playing, speed]);
  useEffect(() => () => { ++generation.current; void release(); }, [release]);
  const exportRun = useCallback(async () => {
    const r = remote.current;
    if (!r) return engine.current!.export();
    const response = await fetch(`${r.base}/api/runs/${r.id}/export`, { headers: { Authorization: `Bearer ${r.token}` } });
    if (!response.ok) throw new Error('Export serveur indisponible.');
    return response.json();
  }, []);
  return { snapshot, playing, speed, status, error, busy: busy || status === 'Connexion au serveur…' || status === 'Reconnexion au serveur…', start, act, exportRun, clearError: () => setError(''), serverBase: remote.current?.base ?? '' };
}
