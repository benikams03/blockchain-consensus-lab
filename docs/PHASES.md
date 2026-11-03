# Phases et quatre lots — Fusion 4

| Phase | Modules | Critère de réception |
|---|---|---|
| 1. Socle | types, configuration, transactions et états locaux | bornes, signatures/nonces, conservation du registre |
| 2. Consensus | PoW, PoS et PBFT | progression honnête, choix local et quorums testés |
| 3. Réseau hostile | latence, partition, panne, branche privée et fautes | événements mesurés sans résultat forcé dans React |
| 4. Pédagogie | graphe, arbre, inspection, 9+7 scénarios, comparaison | état/texte/diagramme cohérents |
| 5. Ateliers | calcul PoW, Merkle, économie, relecture, séries, processus | altération détectée, invariants et isolation |
| 6. DApp | Solidity, Hardhat, MetaMask, Sepolia | tests locaux puis signature personnelle et reçu public |
| 7. Remise | guides, mesures, sécurité, URL, dépôt et archive | installation reproductible et liens effectifs |

Quatre lots : **1 moteur/PoW**, **2 PoS/économie**, **3 PBFT/réseau/serveur**, **4 React/scénarios/comparaison/DApp/docs**. Affecter les noms réels dans le rapport. Le chef intègre les lots ; un module terminé possède README, interfaces et vérifications. Relecture croisée 1↔2 et 3↔4.

## Règles communes obligatoires

1. Les types et la validation de configuration font autorité. Une modification d’interface adapte façade, serveur et vue.
2. Aucun module de consensus n’importe React, DOM, MetaMask ou état global du dessin : seulement une vue locale et des effets.
3. Pas de Math.random/Date.now dans les décisions simulées : seed et horloge virtuelle. Les processus et Sepolia ont des horloges distinctes annoncées.
4. Ne pas muter configuration active, parent partagé ou vote signé. Un bloc invalide ne modifie pas le registre.
5. Comptes, machines, ressources et portefeuille MetaMask sont distincts. Les ressources manuelles priment ; les absents restent dans la mise totale.
6. Compter une identité valide par voix, vérifier domaine/signature/champs/digest. Une livraison réseau n’est pas un engagement.
7. React affiche les résultats du moteur et ne force jamais une conclusion de scénario.
8. Absence de décision, limite et trace partielle restent visibles ; aucune valeur absente ne devient un zéro.
9. Après modification : TypeScript, tests concernés, scénario observable et README. Une modification Solidity impose compile, tests et régénération ABI/bytecode.
10. Aucun secret dans Git/ZIP/rapports. Adresse Sepolia publique ; phrase de récupération et clé privée jamais demandées.

Au jury : lot 1 montre course et double dépense ; lot 2 sélection et finalité ; lot 3 quorum et changement de vue ; lot 4 mesures, visualisation et ancrage. Tous doivent distinguer simulation, calcul SHA-256 et transaction blockchain réelle.
