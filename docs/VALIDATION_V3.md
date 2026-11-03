> Document historique : pour la livraison Fusion 4, lire README.md, MODELE.md et VALIDATION_V4.md.

# Validation de l’édition React 3.0

## Vérifications automatisées

- Vérification TypeScript stricte et construction esbuild réussies.
- **47 tests réussis : 41 tests de moteur/interface pure/API, puis 6 tests de processus.** Les tests en temps réel sont exécutés séparément pour éviter que les calculs virtuels ne retardent leurs temporisateurs.
- Le moteur `src/core/` et les modules `src/consensus/` de référence sont conservés ; les nouvelles politiques vivent dans des modules séparés.
- Tests de preuve : hash recalculé, cible attendue, altérations refusées et indépendance de la taille des lots.
- Tests économiques : dépôt sans émission, poids par époque, votes historiques signés, retrait différé, rejet atomique des montants invalides, finalité et destructions comptables.
- Tests d’analyse : valeurs absentes, essais partiels, incertitude de fréquence et relecture identique à l’état original.
- Tests de processus : PID/ports distincts, livraisons HTTP, arrêt et restauration, partition/rétablissement, doublons, équivocation, signatures invalides, votes retenus à sept nœuds, leader silencieux, contrôle d’accès et idempotence.

La persistance utilise deux trames alternées, numérotées et munies d’une empreinte, avec synchronisation disque. Cela évite les refus de remplacement par renommage rencontrés sous Windows. Les scénarios de processus ont été revérifiés après cette correction.

## Vérifications depuis React

La recherche de preuve, sa validation indépendante et le refus d’une preuve altérée ont été réalisés dans le navigateur. Les dépôts, changements de poids par époque, retraits différés et sanctions ont été exercés depuis les contrôles.

La relecture a chargé l’export de double dépense, recalculé l’état final et permis de revenir à l’observation de succès à 46 secondes. Une série de comparaison et une série d’attaque ont été exécutées en Worker et exportées.

Le mode Distribuer a démarré quatre processus depuis l’interface. Un nœud a été arrêté puis restauré sur un autre PID avec son journal ; une partition a été appliquée, puis l’arrêt automatique de l’expérience a été observé. Le rétablissement et le rejeu sont couverts par les tests de processus.

Le rendu a été vérifié sur ordinateur et sur un viewport de 390 × 844. Le laboratoire de minage et le tableau de staking ne provoquent pas de débordement horizontal de la page ; les tables gardent leur propre défilement.

Les ressources app/CSS/Workers utilisent une empreinte de construction pour éviter de conserver une ancienne interface après mise à jour.

## Preuves exportées

| Fichier dans artifacts/ | Observation |
|---|---|
| v3-preuve-pow.json | Difficulté 3, N0, nonce 3816, hash admissible |
| v3-staking-economique.json | Créneau 20, 34 unités émises, 60 brûlées, offre 3 974, trois preuves signées |
| v3-comparaison-3-graines-48s.json | Neuf essais complets : trois graines pour chacun des trois consensus |
| v3-double-depense-3-graines.json | Graines 7–9, puissance 65 %, k = 2 : deux succès sur trois |
| v3-pbft-processus.json | Quatre PID/ports, certificats de trois COMMIT, N3 restauré, arrêt automatique |

L’export à 24 secondes est également conservé sous un nom distinct. Il montre une durée trop courte pour observer le délai de finalité PoS dans ces essais ; les absences y restent explicites.

Pour 48 secondes, quatre nœuds, graines 42–44, délais 120–700 ms et deux confirmations PoW :

| Médiane entre essais | PoW | PoS | PBFT |
|---|---:|---:|---:|
| TPS retenues | 0,563 | 0,583 | 0,604 |
| Inclusion médiane (s) | 3,113 | 2,071 | 2,385 |
| Délai médian au critère (s) | 6,244 | 21,060 | 2,385 |
| Messages | 396 | 639 | 3 126 |

La fréquence de double dépense de deux succès sur trois a un intervalle de Wilson à 95 % d’environ 20,8–93,9 %. L’intervalle large rappelle que trois graines ne suffisent pas pour conclure à une probabilité précise.

## Limites de la vérification

Les tests ne sont pas une preuve formelle et les séries ne sont pas des benchmarks de Bitcoin/Ethereum. Le calcul de preuve n’est pas une mesure énergétique. Le staking économique possède une chaîne linéaire et ses propres sanctions ; il ne reproduit pas tous les mécanismes de Gasper.

Les processus tournent sur une seule machine avec des clés de démonstration. Les récepteurs HTTP locaux et le pilote ne constituent pas un réseau géographique ou un cluster de conteneurs. Les journaux restent exclus de l’archive ; les rapports JSON publiés ne contiennent pas les capacités d’accès.

Le Site est publié avec son accès privé existant. Les tests visuels portent sur la construction locale ; une connexion ChatGPT peut être nécessaire pour consulter la page hébergée. Aucun déploiement Render/Railway/Vercel externe n’est présumé effectué.
