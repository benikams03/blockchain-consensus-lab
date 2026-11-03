# Module interface de l’Atelier avancé

Mining : Worker de calcul, pause/reprise, compteur de tentatives, preuve et altération vérifiée. Staking : états comptables, mise, retrait, politiques et journal. Replay : capture/import borné, reconstruction en Worker et explication. Experiments : séries et export des résultats avec conditions. Distributed : API Node.js, états de processus et commandes ; aucun faux processus dans le navigateur.

Les onglets conservent leurs résultats. Quitter Miner ou Miser met la lecture en pause. Les Workers sont détruits à la fin ou à la destruction de l’application. Les séries peuvent être annulées. La capture est indépendante du run original. Les capacités d’accès restent en mémoire.

Les modèles et horloges sont affichés dans le contexte de chaque atelier. Les règles actuelles sont dans docs/MODELE.md ; VERSION_3.md est historique. Miner et Miser admettent 2–32 participants ; Miner vérifie aussi Merkle. Relecture et séries courantes utilisent Fusion 4. Tester sur ordinateur et mobile, avec et sans serveur disponible.
