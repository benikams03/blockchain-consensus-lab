// Expose les fonctions de construction et d’empreinte des blocs, ainsi que leurs formats partagés.
export { blockId, makeBlock, headerValues } from '../../../core/src/index.js';
export type { Block, BlockHeader, Transaction } from '../../../contracts/src/index.js';
