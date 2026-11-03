# Module PBFT en processus indépendants

`network.ts` crée un processus par réplique, pilote les délais, les pertes et les commandes, puis collecte les états observés. `replica.ts` conserve un seul NodeState, expose un récepteur HTTP local, vérifie les signatures et exécute le module PBFT. Les communications de contrôle sont en IPC ; les livraisons du protocole sont en HTTP sur la boucle locale.

Les signatures de démonstration sont liées au domaine du run. Le journal contient Maps/Sets et certificats dans deux trames alternées, numérotées et munies d’une empreinte. Les écritures sont synchronisées sur disque avant les émissions et après les traitements ; aucun remplacement par renommage n’est requis sous Windows. Le redémarrage charge la trame valide la plus récente puis reprend les temporisateurs et la synchronisation. Les secrets de transport ne figurent pas dans le rapport public.

`routes.ts` expose création, lecture, commandes idempotentes et suppression. Une capacité aléatoire protège chaque run. Limites : un run, n = 4 ou 7, durée 5–60 secondes, délais 0–500 ms. Les ressources sont libérées à l’arrêt et les runs inactifs expirent.

Les cinq comportements sont honest, silent, equivocate, withhold, invalid. Les commandes crash/restart, partition/heal et replay permettent d’observer panne, reprise, perte et doublons. Le pilote ne peut pas forcer une décision PBFT.

Ce mode n’est ni une preuve formelle, ni une implémentation pour des fonds réels, ni un cluster de conteneurs. Les tests séparent les horloges réelles des tests CPU intensifs du moteur virtuel. Voir docs/VERSION_3.md et tests/distributed.test.ts.
