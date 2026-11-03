# Simulateur pédagogique de consensus — rapport Fusion 4

Équipe de quatre : renseigner noms, matricules, rôle réel de chacun et chef de groupe. Conserver l’attribution du moteur adapté du camarade dans NOTICES.md.

## Problématique et objectif

Rendre visibles les décisions locales, les branches concurrentes et les conditions d’accord de PoW, PoS et PBFT. Permettre de faire varier ressources, nœuds et réseau, puis justifier une recommandation selon mesures et garanties.

## Réalisation

React/TypeScript, D3/SVG, façade commune navigateur/Node, WebSocket optionnel. Moteurs PoW/PoS adaptés du projet du camarade, PBFT et ateliers de Consensus Atelier, inspection des preuves et neuf scénarios complétés de sept expériences. Le registre Solidity V2 et MetaMask Sepolia ancrent les rapports hors chaîne.

## Méthode

États locaux et événements ordonnés ; seed reproductible ; signature/nonce/solde ; course PoW exponentielle et atelier de calcul distinct ; sélection PoS pondérée, LMD-GHOST/certificats ; PBFT 3f+1, préparation/engagement et changement de vue. Voir MODELE.md pour les politiques exactes, ARCHITECTURE.md pour les flux, PHASES.md pour les quatre lots.

## Résultats et validation

Mesures réellement produites dans RESULTATS.md et artifacts/v4. Tests moteurs/API/processus, tests Hardhat, Slither et audit npm sont conservés. La recette de double dépense seed 7 à 65 %, k=2 montre livraison puis remplacement ; k=6 empêche la livraison dans cette même expérience. PoS 20 %/40 % distingue production et finalité ; PBFT préserve les préfixes engagés dans les tests à un fautif sur quatre.

## Limites et perspectives

Topologie complète, délais uniformes, difficulté PoW et mises/comité fixes ; pas de coûts énergétiques mesurés, ni client Bitcoin/Ethereum complet. Identités simulées publiques, RPC et outils de développement à auditer, quotas/authentification nécessaires en production. Évolution : topologies réalistes, exécutions multi-machines, modèle économique intégré versionné, preuve d’exécution vérifiable et migration de l’outillage.

## Preuves à joindre

URL publique, URL GitHub du groupe, contrat Sepolia vérifié, reçus et rapports, captures des scénarios et contributions réelles. Le financement de test et la signature du déploiement Sepolia restent personnels ; la publication de l’interface seule ne suffit pas. Voir CONFORMITE_PROFESSEUR.md.
