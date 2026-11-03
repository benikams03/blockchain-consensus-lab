# Ateliers avancés — édition Fusion 4

pow-proof.ts calcule SHA-256 sous cible, preuve de nonce et chemin Merkle vérifiables. Course de 2 à 32 mineurs orchestrée dans un Worker unique : pas des threads matériels indépendants. Format pédagogique distinct de Bitcoin.

staking.ts gère 2 à 32 portefeuilles fictifs : dépôt, retrait différé, poids figés par époque, propositions/votes, émission et destruction. Invariant : offre initiale + émis − brûlé ; déposer ne crée pas de monnaie. C’est une chaîne économique linéaire séparée du réseau Gasper, avec des politiques pédagogiques.

analysis.ts explique les observations, reconstruit le modèle sélectionné et agrège les séries. Absences restent null, essais partiels séparés, fréquence avec intervalle de Wilson. La relecture courante utilise Fusion 4 ; les fichiers historiques doivent être interprétés avec leur modèle/version et ne donnent pas une promesse de compatibilité bit à bit avec des éditions modifiées.

Distribuer exécute PBFT dans plusieurs PID/ports locaux, horloge réelle. Tests : advanced.test.ts, fusion.test.ts et distributed.test.ts. VERSION_3.md conserve l’histoire des ateliers ; règles actuelles : docs/MODELE.md.
