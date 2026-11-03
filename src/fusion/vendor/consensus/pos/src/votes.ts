// Les votes sont des messages signés. Les transitions de réception restent centralisées dans PosAdapter.onInput.
// La réception et les transitions sont centralisées dans PosAdapter.onInput.
export { signMessage, verifyMessage, messageId, payloadValues } from '../../../core/src/index.js';
export type { HeadVote, LinkVote, SignedMessage } from '../../../contracts/src/index.js';
