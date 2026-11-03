# Conformité et pièces de remise

Source : PDF du professeur, exigences générales p.1 et sujet simulateur p.3. Cette matrice décrit la livraison, sans remplacer les modalités finales du professeur.

| Exigence | Pièce | État / action restante |
|---|---|---|
| PoW/PoS/PBFT, réseau, blocs, fourches, finalité, attaques | Fusion, inspection et 16 recettes | implémenté et testé |
| Nœuds, latence, puissance/mise réglables | ressources individuelles, pannes et comptes indépendants | implémenté |
| Tableau et diagramme | comparaison par Worker et conclusions mesurées | implémenté ; annoncer conditions/garanties |
| Smart contract déployé ou propre blockchain privée en ligne | ResultsRegistry V2 + déploiement MetaMask | **contrat testé ; déploiement Sepolia à signer après financement de test** |
| DApp/portefeuille ou API documentée | MetaMask Sepolia et HTTP/WebSocket | implémenté ; démonstration publique de l’écriture après signature |
| Tests Hardhat/Foundry, analyse sécurité | tests, Slither, audits npm | rapports dans artifacts/ |
| Accès, entrées, événements, réentrance, données personnelles | msg.sender, bornes, immutabilité, événement, pas d’appel externe | SECURITE.md ; aucune donnée personnelle applicative stockée |
| Architecture chaîne/hors chaîne et gas | guides et contracts-gas.json | documenté ; joindre gasUsed réel Sepolia |
| URL publique, GitHub, explorateur | interface publique et archive source | **GitHub à publier sous le compte du groupe, contrat à déployer** |
| Render/Railway et Vercel du sujet | render.yaml, railway.json, vercel.json | configurations fournies ; publication Sites distincte |
| Rapport, menaces, limites, évolution | guides, mesures et soutenance | personnaliser auteurs/matricules/contributions/captures |

Publier l’interface seule ne complète pas les preuves de remise. Ne pas annoncer adresse Sepolia ou dépôt GitHub avant existence réelle. Si le professeur impose précisément Render/Railway et Vercel, effectuer ces déploiements avec les comptes du groupe ; l’URL Sites est une DApp consultable publiquement.
