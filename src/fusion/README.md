# Module Fusion

Point d’entrée courant engine.ts, modèle atelier-fusion-4.1.0. API : configuration, step, advance, run, snapshot, metrics, export. Navigateur, Node et Workers utilisent ce point.

participants convertit ressources manuelles/part contrôlée en poids entiers. Le constructeur sépare machines/comptes, planifie les paiements puis crée PowSimulation, PosHarness ou PBFT. sync normalise les observations sans donner de vérité globale aux nœuds. L’observateur reste fixe ; l’inspection est une copie sans pouvoir de décision.

vendor adapte les modules du camarade : messages, registre, ordonnanceur, PoW et PoS. Modifications : cryptographie portable noble, branche privée différée, critère de double dépense renforcé, variantes de fautes différées, export des preuves/certificats, aucune identité privée importée. Attribution : NOTICES.md.

verification.ts relit signatures/quorums/checkpoints/source justifiée pour PoS et COMMIT/vue/séquence/digest pour PBFT. Cela ne prouve pas l’exécution de toute la trace. Voir tests/fusion.test.ts, scripts/validate-v4.mjs et docs/MODELE.md.

## Rôles — édition 4.1

nodeCount décrit le réseau total ; consensusNodes liste les participants. Les autres vérifient comme suiveurs. core/participants.ts centralise les poids et contrôlés ; Snapshot.nodes[].participates expose le rôle. PBFT calcule leaders, f et quorums sur ce comité et rejette les votes extérieurs. Le formulaire choisit total, nombre et identités. Voir docs/ROLES_NOEUDS.md et tests/roles.test.ts.
