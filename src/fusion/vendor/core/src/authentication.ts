// Expose la création et la vérification des messages signés ; les clés restent gérées par l’hôte.
export { loadOrCreateIdentity, signId, verifyId, signMessage, verifyMessage } from './crypto.js';
