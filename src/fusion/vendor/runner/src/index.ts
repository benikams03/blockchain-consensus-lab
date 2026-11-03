// Expose le banc autonome et ses mesures ; PosSimulation est le nom lisible de PosHarness.
export { PosHarness, PosHarness as PosSimulation } from './engine.js';
export type { DemoNode, VoteRecord } from './engine.js';
export * from './metrics.js';
export * from './reports.js';
