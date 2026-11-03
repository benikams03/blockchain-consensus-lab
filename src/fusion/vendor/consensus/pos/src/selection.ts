// La sélection pondérée est implémentée dans core/random.ts et core/model.ts ; ce fichier la rend accessible au lot PoS.
export { createSeededRandom, selectProposer, SELECTION_VERSION, proposerForSlot } from '../../../core/src/index.js';
