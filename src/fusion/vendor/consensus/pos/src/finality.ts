// Expose les checkpoints et certificats : une justification n’est pas automatiquement une finalisation.
export { verifyCertificate, certificateId, checkpointAtBoundary } from './adapter.js';
export { checkpointKey, validCheckpoint, hasSupermajority } from '../../../core/src/index.js';
