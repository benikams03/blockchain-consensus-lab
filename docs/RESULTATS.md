> Référence archivée des recettes 4.0. Les nouveaux exemples N/K sont dans artifacts/v4.1/roles-results.json et ROLES_NOEUDS.md.

# Résultats mesurés — Fusion 4

Seed et configuration sont conservées intégralement dans artifacts/v4/scenarios-results.json. Fenêtre : 90 s. Blocs hors genesis ; transactions retenues chez l’observateur fixe ; finalité PoS ou engagement PBFT.

| Expérience | Seed | Blocs | Tx retenues | Tx au critère | Hauteur finalisée/engagée | Réorg. | Preuves |
|---|---|---|---|---|---|---|---|
| La naissance d’un accord | 42 | 24 | 40 | 40 | 0 | 1 | 0 |
| Deux blocs. Une place. | 17 | 26 | 40 | 40 | 0 | 5 | 0 |
| Le paiement qui disparaît | 7 | 33 | 39 | 39 | 0 | 1 | 0 |
| Des blocs sans finalité | 42 | 29 | 40 | 0 | 0 | 1 | 9 |
| Le silence du leader | 42 | 42 | 40 | 40 | 42 | 0 | 0 |
| Un réseau coupé en deux | 42 | 17 | 40 | 40 | 17 | 0 | 0 |
| La force d’une branche privée | 7 | 32 | 40 | 40 | 0 | 1 | 0 |
| La finalité tient bon | 42 | 30 | 40 | 40 | 24 | 2 | 5 |
| Deux leaders à remplacer | 42 | 33 | 40 | 40 | 33 | 0 | 0 |
| Vérifier sans miner | 42 | 24 | 40 | 40 | 0 | 0 | 0 |
| Vérifier sans mise | 42 | 30 | 40 | 40 | 24 | 0 | 0 |
| La mise devenue absente | 42 | 26 | 21 | 0 | 0 | 0 | 0 |
| Signé ne veut pas dire envoyé | 42 | 30 | 40 | 0 | 0 | 0 | 0 |
| Deux votes qui s’entourent | 42 | 30 | 40 | 40 | 24 | 0 | 4 |
| Le leader parle en deux versions | 42 | 42 | 40 | 40 | 42 | 0 | 5 |
| Une voix sans signature valide | 42 | 37 | 21 | 21 | 37 | 0 | 0 |

La double dépense seed 7 : livraison à 17,054 s, publication privée à 45 s, conflit confirmé et réussite à 45,574 s. Une transaction conflictuelle est exclue de la branche finale : 39 retenues sur 40 soumises.

Les pannes ou signatures réseau invalides peuvent empêcher la propagation de certains paiements ; absence de finalité et absence d’inclusion sont deux mesures différentes. La partition PBFT récupère ses paiements après guérison grâce aux retransmissions locales.

Ces observations ne sont pas des valeurs codées dans React. Une autre configuration ou un autre modèle modifie les résultats. Voir SOUTENANCE.md pour l’interprétation et les manipulations isolant une variable.
