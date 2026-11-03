# Module HTTP et WebSocket

Serveur Node natif et ws. `makeServer` permet les tests sans lancer un serveur global. `npm start` utilise PORT (4173 par défaut), HOST (127.0.0.1 par défaut) et ALLOWED_ORIGINS (liste séparée par virgules).

| Route | Usage |
|---|---|
| GET /api/health | état du service |
| POST /api/runs | configuration -> id, jeton et snapshot initial |
| GET /api/runs/:id/snapshot | état complet |
| POST /api/runs/:id/commands | play, pause, step, speed + commandId |
| GET /api/runs/:id/events?after=N | observations strictement après N |
| GET /api/runs/:id/export | configuration, trace et résultats |
| DELETE /api/runs/:id | fermer et libérer une session |
| WS /api/runs/:id/stream?token=... | snapshots complets en lecture et à l'ouverture |

Les routes d'une session exigent Authorization: Bearer suivi du jeton. Le WebSocket utilise le jeton dans son URL : protéger la connexion par HTTPS/WSS, ne pas journaliser les URLs complètes et ne jamais partager ce jeton.

Commandes idempotentes par commandId. step exige la pause ; play refuse une expérience terminée. Sessions en mémoire, maximum 8, expiration après inactivité. Les snapshots remplacent la projection complète et portent nextSeq ; les événements complets se récupèrent par HTTP.

Le serveur sert aussi dist/. Il ne fournit pas de stockage permanent ni de coordination entre plusieurs instances. Les tests couvrent validation, isolation, idempotence, curseur et une vraie négociation WebSocket.

## Rôles — édition 4.1

nodeCount décrit le réseau total ; consensusNodes liste les participants. Les autres vérifient comme suiveurs. core/participants.ts centralise les poids et contrôlés ; Snapshot.nodes[].participates expose le rôle. PBFT calcule leaders, f et quorums sur ce comité et rejette les votes extérieurs. Le formulaire choisit total, nombre et identités. Voir docs/ROLES_NOEUDS.md et tests/roles.test.ts.
