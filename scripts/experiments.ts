import { Simulation, FUSION_MODEL } from '../src/fusion/engine.js';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Protocol } from '../src/core/types.js';
const results = [];
for (const seed of [7, 19, 42])
    for (const protocol of ['pow', 'pos', 'pbft'] as Protocol[]) {
        const sim = new Simulation({ protocol, seed, nodeCount: 7, duration: 60000, releaseAt: 35000 });
        sim.run();
        results.push({ protocol, seed, config: sim.config, metrics: sim.metrics(), termination: sim.termination });
        console.log(protocol, seed, JSON.stringify(sim.metrics()));
    }
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/experiments.json', JSON.stringify({ modelVersion: FUSION_MODEL, conditions: '7 honnêtes, 60 secondes simulées, réseau et charge identiques ; rythmes propres conservés', results }, null, 2));
