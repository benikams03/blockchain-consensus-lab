import { Simulation } from '../fusion/engine.js';
import type { Config, Protocol } from '../core/types.js';
self.onmessage = (event: MessageEvent<{
    config: Partial<Config>;
}>) => {
    try {
        const results = [];
        for (const protocol of ['pow', 'pos', 'pbft'] as Protocol[]) {
            self.postMessage({ type: 'progress', protocol });
            const config = { ...event.data.config, protocol, attack: 'none' as const, nodeCount: 7, consensusNodes: [], resources: [], offlineNodes: [], faultBehavior: 'default' as const };
            const sim = new Simulation(config);
            sim.run();
            results.push({ protocol, config: sim.config, metrics: sim.metrics(), termination: sim.snapshot().termination });
        }
        self.postMessage({ type: 'results', results });
    }
    catch (e) {
        self.postMessage({ type: 'error', message: (e as Error).message });
    }
};
