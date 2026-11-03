# Vérification — Fusion 4

npm test compile et exécute les tests des moteurs, des régressions, de Fusion, de l’API et des ateliers, puis les tests de processus séparément pour préserver leurs délais réels. La livraison a passé 74 tests de ce parcours (68 moteurs/API/ateliers, puis 6 processus). npm run contracts:test exécute les sept tests Hardhat du registre. Les dernières vérifications et limites sont dans docs/VALIDATION_V4_1.md.

fusion.test.ts couvre ressources nulles, comptes indépendants, déterminisme, anciennes erreurs de message/checkpoint, certificats altérés, cinq comportements PBFT, partition, double dépense, Merkle et garde Sepolia. scripts/validate-v4.mjs exécute les seize recettes et produit les mesures et rapports exemples.

Les tests de processus vérifient PID/ports, journaux, quorums et signatures, puis arrêtent leurs enfants ; nettoyage borné aux répertoires temporaires attendus. Aucun succès ne constitue une preuve formelle de consensus. Aucune transaction Sepolia publique n’est envoyée par ces tests.

roles.test.ts vérifie neuf cas de séparation des rôles, y compris signatures de suiveurs sans pouvoir de vote et rotation du seul comité. Voir docs/ROLES_NOEUDS.md.
