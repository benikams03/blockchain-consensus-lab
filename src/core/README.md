# Socle et moteur historique

types/config/ledger/primitives définissent vocabulaire, bornes et règles. engine.ts est encore le réseau logique PBFT de Fusion. Ses PoW/PoS historiques sont gardés comme référence/régressions ; **le laboratoire utilise désormais les PoW/PoS de src/fusion/vendor**.

PBFT a des comptes/paiements configurables. Pannes bloquent les traitements, fautes modifient les envois, synchronisations récupèrent parents/certificats/paiements. Le bloc normalisé de dessin ne remplace pas l’original signé. Lire src/fusion/README.md, docs/MODELE.md et ARCHITECTURE.md.

## Rôles — édition 4.1

nodeCount décrit le réseau total ; consensusNodes liste les participants. Les autres vérifient comme suiveurs. core/participants.ts centralise les poids et contrôlés ; Snapshot.nodes[].participates expose le rôle. PBFT calcule leaders, f et quorums sur ce comité et rejette les votes extérieurs. Le formulaire choisit total, nombre et identités. Voir docs/ROLES_NOEUDS.md et tests/roles.test.ts.
