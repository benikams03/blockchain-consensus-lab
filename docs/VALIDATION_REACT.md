> Document historique : pour la livraison Fusion 4, lire README.md, MODELE.md et VALIDATION_V4.md.

# Validation de l’édition React 2.0

## Portée

Migration de l’interface, enrichissement du parcours, neuf scénarios et comparaison interprétée. Aucun changement aux sources du moteur `src/core/`, des consensus `src/consensus/` ou du serveur `server/`. Modèle conservé : atelier-1.0.0.

## Vérifications automatisées

- Vérification TypeScript stricte réussie.
- 31 tests Node réussis, zéro échec (25 tests existants et 6 tests d’expérience / interprétation).
- Construction esbuild réussie : bundle React, Worker et serveur TypeScript compilé.
- Installation verrouillée reproductible des dépendances ; audit npm lors de l’installation : zéro vulnérabilité signalée.

Les ajouts vérifient neuf recettes valides et distinctes ; la publication privée PoW avec réorganisation sans double dépense ; le contraste de finalité entre 20 % et 40 % de mise contrôlée ; deux leaders PBFT silencieux avec reprise et certificats d’au moins cinq COMMIT ; les conclusions calculées ; l’absence de fausse victoire pour une mesure non atteinte ou partielle.

## Contrôles de l’interface

Lecture/pause et progression réellement calculée ; neuf cartes présentes et recettes appliquées ; inspection des nœuds et des blocs ; comparaison réelle exécutée en Worker ; diagramme sélectionnable ; export JSON de comparaison ; contrôles responsive et navigation mobile.

Connexion React au moteur Node.js et progression par véritable WebSocket vérifiées. La recette double dépense a aussi été terminée depuis cette interface en mode serveur : 20 blocs retenus, livraison à 43,245 s, paiement remplacé, marchand revenu à 1 000 unités, deux réorganisations. Son export est `artifacts/double-depense-react-serveur.json`. Fermeture Échap du registre et absence d’erreurs de console vérifiées.

La comparaison seed 42 / 90 s / 7 nœuds / 120–700 ms a été exécutée depuis React et exportée dans `artifacts/comparaison-react-seed42.json` :

| Mesure | PoW | PoS | PBFT |
|---|---:|---:|---:|
| Blocs retenus | 21 | 30 | 42 |
| Tx retenues | 53 | 54 | 54 |
| Tx au critère | 51 | 43 | 54 |
| Inclusion médiane (s) | 3,57 | 2,12 | 2,52 |
| Délai médian au critère (s) | 13,12 | 21,13 | 2,52 |
| Messages envoyés | 2 201 | 3 912 | 22 530 |

Ces nombres décrivent une configuration du modèle. Ils ne comparent pas des garanties équivalentes et ne mesurent pas la capacité maximale ou l’énergie. Le JSON exporté est la référence exacte pour les valeurs non arrondies.

## Preuves visuelles

Les captures `artifacts/react-laboratoire-desktop.png`, `react-laboratoire-mobile.png` et `react-comparaison-desktop.png` documentent l’édition React. Les anciennes captures restent celles de la première interface. Les tailles de test incluent un viewport ordinateur de 1 440 × 1 000 et un viewport mobile de 390 × 844 ; la largeur CSS utile peut être réduite par la barre de défilement du navigateur.

## Limites

Les tests ne sont pas une preuve formelle. La vérification visuelle se fait sur le serveur local construit. Le Site privé est publié selon les accès existants ; son authentification peut empêcher une inspection de la page déployée sans connexion de l’utilisateur. Render/Railway et Vercel ont leurs fichiers de configuration, sans déploiement de comptes externes présumé.
