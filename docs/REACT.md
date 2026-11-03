> Document historique : pour la livraison Fusion 4, lire README.md, MODELE.md et VALIDATION_V4.md.

# Architecture et règles de développement React

## Pourquoi cette migration

L’interface précédente utilisait TypeScript et des chaînes HTML réinjectées dans le DOM. Cette édition utilise de vrais composants React, des propriétés typées et de l’état contrôlé. Elle conserve la direction visuelle et toutes les règles du moteur ; elle enrichit l’apprentissage, les scénarios et l’interprétation.

HTML reste présent : le navigateur affiche toujours un document HTML et des SVG. React organise leur rendu et la synchronisation de l’état. `index.html` sert de point de montage, pas d’implémentation monolithique de l’application.

## Phases, modules et quatre lots

Les phases existantes restent dans PHASES.md. La migration ajoute : contrat d’état, composants, neuf expériences, comparaison interprétée, validation et livraison. Les quatre lots sont des responsabilités de lecture et de revue ; ils ne sont pas quatre applications.

1. Socle et PoW : core, registre, course PoW, confidentialité de branche et réorganisation.
2. PoS et cohérence théorique : mise, votes, choix de tête, justification et finalité.
3. PBFT et expériences : quorums, vues, neuf recettes, métriques et interprétations.
4. React et intégration : composants, transports, accessibilité, responsive, construction et diffusion.

Le chef de groupe peut réaliser les quatre lots ; les contributions présentées à l’examen doivent refléter le travail réel.

## Arbre de l’interface

```text
main.tsx                       createRoot + frontière d’erreur
App.tsx                        navigation, laboratoire et inspection
hooks/useSimulation.ts         moteur local, lecture, cycle de vie et transport
components/ConfigPanel.tsx     brouillon de configuration et application
components/NetworkGraph.tsx    réseau, arbre des blocs et géométrie D3
components/ui.tsx              dialogue, journal, icônes et export JSON
pages/Comparison.tsx           Worker, tableau, diagramme et conclusions
pages/Learn.tsx                notions et politiques du modèle
features/scenarios.ts          neuf configurations complètes
features/comparison.ts         types, mesures et interprétations pures
worker.ts                      trois exécutions hors du thread d’interface
styles.css                     identité, états, responsive et accessibilité
```

## Flux de données

```mermaid
flowchart LR
  Form[Brouillon du formulaire] -->|Appliquer| Hook[useSimulation]
  Hook --> Local[Simulation locale]
  Hook -->|HTTP commandes| Server[API Node.js]
  Server -->|WebSocket| Snap[Snapshot]
  Local --> Snap
  Snap --> UI[Composants React]
  UI -->|configuration capturée| Worker[Worker de comparaison]
  Worker --> Results[Résultats et configurations]
  Results --> Table[Tableau, diagramme et interprétations]
```

Le moteur mutable vit dans une référence du hook, hors de l’état React. Les snapshots sont publiés dans l’état. Les timers sont nettoyés ; les commandes distantes sont sérialisées. Créer un run ferme et supprime l’ancienne session distante. Les capacités d’accès restent en mémoire.

La page Comparaison reste montée durant la navigation, pour conserver ses résultats et laisser son Worker finir. Le Worker est détruit après résultat, erreur ou destruction de l’application. Une nouvelle comparaison remplace l’ancienne. Les conditions du tableau viennent des résultats stockés, jamais du formulaire courant.

## Règles communes obligatoires

1. **Une source de vérité par responsabilité.** `Snapshot` décrit le run ; le formulaire a son brouillon ; les résultats comparatifs conservent leur configuration. Ne pas recopier les mesures dans des états indépendants.
2. **Le consensus appartient au moteur.** Aucune composante ne fabrique un bloc, une signature, un solde ou un résultat d’attaque. Utiliser `Simulation`, `configuration()` et les contrats typés.
3. **React possède le DOM et les SVG.** D3 fournit des fonctions de géométrie et d’échelle. Ne pas utiliser `innerHTML` ou `d3.select()` pour remplacer des éléments gérés par React.
4. **Les scénarios sont complets et reproductibles.** Ne pas mélanger une recette avec les paramètres résiduels du run précédent. Ne jamais afficher « succès » seulement parce qu’un pourcentage dépasse un seuil.
5. **Les unités sont explicites.** Millisecondes dans le moteur ; secondes affichées lorsqu’indiqué. La vitesse de lecture ne change ni la seed ni les délais simulés.
6. **Une absence de décision reste `null`.** Afficher « Non atteint », jamais zéro. Une trace arrêtée par limite ne devient pas un résultat complet.
7. **La vue globale ne devient pas une connaissance locale.** Les blocs privés peuvent être montrés au lecteur, mais les honnêtes ne les utilisent qu’après réception et validation.
8. **Une modification crée un run.** Ne pas changer nœuds, poids ou politique au milieu d’une expérience. Les deux bornes de latence sont éditées explicitement.
9. **Contrôles accessibles.** Boutons réels, labels de champs, focus visible, clavier pour nœuds et blocs, Échap pour les dialogues ; garder les cinq destinations de navigation sur mobile.
10. **Documenter et vérifier les changements utiles.** Exécuter check/tests/build selon leur portée ; mettre à jour le README du module et le modèle si les règles changent. Changer MODEL_VERSION seulement pour une modification du modèle.

## Construction et versionnement

React et ses types figurent dans package.json ; package-lock.json fige les versions installées. TypeScript utilise `jsx: react-jsx` et inclut les `.tsx`. esbuild produit `dist/app.js` depuis `main.tsx`, ainsi que le Worker. Le serveur compilé reste dans `build/server/index.js`.

La migration initiale utilisait l’application 2.0.0 et le modèle `atelier-1.0.0`. L’édition 3.0 conserve les règles de ce moteur et ajoute des modèles avancés séparés ainsi qu’une API de processus. Voir VERSION_3.md. Les différences UI assumées sont : départ à zéro, latence minimum/maximum explicite, navigation mobile complète et pause distante lors d’une reconnexion.

Les anciens PDF décrivent la première édition de l’interface. Les règles du modèle restent valables ; les neuf scénarios, la structure React et les nouveaux contrôles sont décrits dans la documentation courante.


## Ressources de l’édition 3

Le build calcule une empreinte des sources et du verrou npm. Le document HTML référence app.js et styles.css avec cette empreinte ; les URL de Workers reçoivent la même version. Les anciennes ressources mises en cache ne doivent pas masquer une mise à jour. Les cinq ateliers et le réseau de processus sont décrits dans VERSION_3.md.
