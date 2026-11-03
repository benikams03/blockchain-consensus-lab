# Module composants

`NetworkGraph` rend les connaissances locales des nœuds et les messages récents, avec des éléments SVG possédés par React. `ChainView` reconstruit uniquement les liens d’affichage depuis le catalogue observé ; il n’adopte aucun bloc. Le contrôle « Tout l’arbre » retrouve les anciennes fourches par défilement horizontal, même après la fin du run. Les branches concurrentes ont leur propre ligne.

`ConfigPanel` maintient un brouillon indépendant ; seule sa soumission crée un run. Les bornes réseau sont visibles. Les champs avancés permettent seed, charge, confirmations, époques et dates de perturbation.

`ui.tsx` fournit icônes, dialogue natif, journal humain et téléchargement JSON. React échappe les contenus ; aucun HTML reçu du moteur n’est injecté. Les contrôles SVG sont accessibles par clavier, les dialogues par Échap.

Vérifier avec TypeScript, puis inspecter réseau, bloc, registre, focus, formulaire et absence de débordement sur mobile.

Fusion 4 : ressources individuelles, pannes et comptes indépendants dans ConfigPanel ; Inspector distingue signatures, envois, réceptions et utilisation et vérifie les certificats publics. Plus de 16 nœuds : grille, liaisons sélectionnées et pannes grises.

## Rôles — édition 4.1

nodeCount décrit le réseau total ; consensusNodes liste les participants. Les autres vérifient comme suiveurs. core/participants.ts centralise les poids et contrôlés ; Snapshot.nodes[].participates expose le rôle. PBFT calcule leaders, f et quorums sur ce comité et rejette les votes extérieurs. Le formulaire choisit total, nombre et identités. Voir docs/ROLES_NOEUDS.md et tests/roles.test.ts.
