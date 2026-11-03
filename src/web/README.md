# Interface React — Fusion 4

main.tsx monte React 19 ; App.tsx compose laboratoire, scénarios, comparaison, Sepolia, théorie et designs. Le hook useSimulation coordonne moteur local et API/WebSocket. Le rendu consomme des snapshots, sans choisir producteur ou quorum.

NetworkGraph dessine les machines et messages ; pour plus de 16 machines, disposition en grille avec liaisons du nœud sélectionné. ChainView conserve toutes les branches. ConfigPanel distingue brouillon/expérience active, comptes/machines, ressources/pannes. Inspector expose paiements, découvertes, votes et certificats, avec vérification publique. Trois directions de design restent accessibles, le style botanique est retenu.

features/scenarios.ts contient 9 étapes et 7 explorations. Comparison utilise un Worker et sept honnêtes, même charge/capacité/latence. Les recommandations résultent des mesures et annoncent leurs limites. Les ateliers avancés utilisent advanced-worker et affichent leurs modèles séparés. Blockchain utilise ethers/MetaMask sur Sepolia et ne conserve un succès qu’après reçu confirmé.

Clavier : Tab puis Entrée/Espace pour nœuds/blocs ; dialogues natifs avec Échap. Pas de raccourci global qui vole la saisie. Vérifier bureau/mobile, états vides, erreurs, Workers, certificats et exports après modification. Guides actuels : docs/MODELE.md, ARCHITECTURE.md et SEPOLIA.md.

## Rôles — édition 4.1

nodeCount décrit le réseau total ; consensusNodes liste les participants. Les autres vérifient comme suiveurs. core/participants.ts centralise les poids et contrôlés ; Snapshot.nodes[].participates expose le rôle. PBFT calcule leaders, f et quorums sur ce comité et rejette les votes extérieurs. Le formulaire choisit total, nombre et identités. Voir docs/ROLES_NOEUDS.md et tests/roles.test.ts.
