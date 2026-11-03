# Origine des modules intégrés

La version 4 adapte les modules PoW/PoS, registre, ordonnanceur, scénarios et projections du projet `simulateur-consensus` fourni par un autre membre du groupe dans la conversation. Archive de référence SHA-256 : `24ac202261907af8958003b0da5771d18bc42f254ca19b3a908efc918813ed14`, version déclarée 3.2.0.

Les fichiers adaptés se trouvent dans `src/fusion/vendor/`. La cryptographie est portée sur noble pour le navigateur ; les chemins TypeScript sont harmonisés ; l'intégration, PBFT, React et les ateliers proviennent de Consensus Atelier. Le registre Solidity est adapté pour inclure PBFT et possède un identifiant de version différent. Aucun fichier d'identité privée du ZIP n'a été repris.

Renseigner les auteurs et contributions réels avant la remise. Cette attribution ne prétend pas attribuer à l'équipe des composants externes : React, D3, noble, ws, ethers, Hardhat et solc restent soumis aux licences de leurs auteurs.
