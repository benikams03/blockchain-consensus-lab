# Module cycle de vie et transport

`useSimulation` expose snapshot, lecture, vitesse, état de connexion, erreurs, création et export. La Simulation locale vit dans une référence ; React reçoit des snapshots. L’avancement est borné et ne dépend pas du rendu des graphes.

Le mode distant crée une session HTTP isolée, conserve sa capacité en mémoire, envoie des commandes idempotentes et remplace le snapshot par les messages WebSocket. Une reconnexion déclenche une pause distante pour synchroniser les contrôles. Changer de run supprime la session précédente ; la destruction nettoie timers et connexion.

Ne pas ajouter de logique de vote, de sélection de branche ou de registre à ce hook. Les contrôles de configuration restent dans core/config.ts. Les tests du serveur vérifient la véritable liaison WebSocket ; les contrôles navigateur vérifient son utilisation par React.
