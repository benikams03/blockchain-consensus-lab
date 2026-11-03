# Registre Solidity V2

contracts/ResultsRegistry.sol conserve une déclaration par auteur/empreinte. Protocoles : 0 PoW, 1 PoS, 2 PBFT ; identité UNIKIN_CONSENSUS_RESULTS_V2. Pas de fonds, d’administrateur, d’appel externe ou de réécriture. Aucune validation du calcul hors chaîne.

npm run contracts:compile puis npm run contracts:test. Hardhat utilise solc 0.8.28 local, optimiseur 200, EVM Paris. Compile régénère ABI/bytecode React et entrée Standard JSON. Tests : test/ResultsRegistry.cjs ; gas : artifacts/contracts-gas.json ; Slither : docs/SECURITE.md.

Déployer personnellement dans Sepolia & preuves avec MetaMask, sans clé dans un .env. Compléter deployment/sepolia.json après reçu. Procédure : docs/SEPOLIA.md.

Fusion 4.1 : le champ nodes du résumé est le total physique, le comité étant inclus dans l’empreinte du rapport. La DApp affiche total et participants séparément. Le source Solidity V2 est inchangé ; aucune migration du contrat n’est nécessaire.
