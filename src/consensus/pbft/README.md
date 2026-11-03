# PBFT utilisé par Fusion 4

n=4/7/10, f=(n−1)/3, leader N(view mod n). PRE-PREPARE valide + 2f PREPARE de secours créent une préparation ; 2f+1 COMMIT distincts du même digest/vue/séquence engagent. VIEW_CHANGE/NEW_VIEW transportent les preuves et préservent la préparation pertinente.

Fautes : leader silencieux, silence complet, votes retenus, équivoque, signatures invalides. Partition 2+2 : aucun quorum de trois. Sécurité annoncée seulement à au plus f fautes ; progression sous conditions réseau. La synchronisation récupère blocs/certificats/paiements depuis les états locaux.

La façade expose les certificats signés et leurs détenteurs. tests/fusion.test.ts vérifie les cinq comportements, préfixes compatibles et reprise. Distribuer est un autre modèle : processus distincts sur le même poste, horloge réelle.

## Rôles — édition 4.1

nodeCount décrit le réseau total ; consensusNodes liste les participants. Les autres vérifient comme suiveurs. core/participants.ts centralise les poids et contrôlés ; Snapshot.nodes[].participates expose le rôle. PBFT calcule leaders, f et quorums sur ce comité et rejette les votes extérieurs. Le formulaire choisit total, nombre et identités. Voir docs/ROLES_NOEUDS.md et tests/roles.test.ts.
