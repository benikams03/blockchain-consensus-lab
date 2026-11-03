import { MiningRace } from '../advanced/pow-proof.js';
import { aggregate, replay, type Sample } from '../advanced/analysis.js';
import { Simulation, FUSION_MODEL } from '../fusion/engine.js';
import { configuration } from '../core/config.js';
import type { Config } from '../core/types.js';
let race: MiningRace | null = null, mining = false, started = 0, elapsed = 0;
let miningTimer: ReturnType<typeof setTimeout> | null = null;
function mine() {
  if (!mining || !race) return;
  const state = race.batch(1000);
  self.postMessage({ type: 'mining', ...state, elapsed: elapsed + performance.now() - started });
  if (state.winner || state.exhausted) { mining = false; return; }
  miningTimer = setTimeout(mine, 0);
}
self.onmessage = (event: MessageEvent) => {
  const d = event.data;
  try {
    if (d.type === 'mine') { race = new MiningRace(d.seed, d.difficulty, d.powers); mining = true; elapsed = 0; started = performance.now(); mine(); }
    if (d.type === 'pause') { if (mining) { elapsed += performance.now() - started; mining = false; if (miningTimer) clearTimeout(miningTimer); miningTimer = null; } }
    if (d.type === 'resume' && race && !mining && !race.winner) { mining = true; started = performance.now(); mine(); }
    if (d.type === 'replay') self.postMessage({ type: 'replay', snapshot: replay(configuration(d.config), d.sequence, d.modelVersion) });
    if (d.type === 'batch') {
      if (!Number.isInteger(d.trials) || d.trials < 1 || d.trials > 20 || !['comparison', 'double'].includes(d.mode)) throw new Error('BATCH_CONFIG');
      const base = configuration(d.config), protocols: Config['protocol'][] = d.mode === 'double' ? ['pow'] : ['pow', 'pos', 'pbft'], samples: Sample[] = [];
      for (let i = 0; i < d.trials; i++) for (const protocol of protocols) {
        const config = configuration({ ...base, protocol, nodeCount: d.mode === 'double' ? 7 : 4, seed: (base.seed + i) >>> 0, attack: d.mode === 'double' ? 'double' : 'none', faultyNodes: 1, consensusNodes: [], resources: [], offlineNodes: [], faultBehavior: 'default' });
        self.postMessage({ type: 'progress', done: samples.length, total: d.trials * protocols.length, protocol, seed: config.seed });
        const sim = new Simulation(config); sim.run(); samples.push({ protocol, seed: config.seed, config, metrics: sim.metrics(), termination: sim.snapshot().termination });
      }
      self.postMessage({ type: 'batch', samples, aggregates: aggregate(samples), mode: d.mode, modelVersion: FUSION_MODEL, analysisVersion: 'atelier-4.0.0' });
    }
  } catch (e) { mining = false; self.postMessage({ type: 'error', message: (e as Error).message }); }
};
