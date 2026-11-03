> Archive de validation 4.0. Pour les rôles explicites, lire VALIDATION_V4_1.md.

# Validation — Fusion 4, 2 novembre 2026

## Contrôles automatiques

- TypeScript strict et construction React/dist : réussis.
- Parcours complet npm test : 59 tests socle/ateliers/Fusion/API, puis 6 tests de processus ; **65 réussis, aucun échec**.
- Nouvelle vérification ciblée après corrections : **19 tests Fusion/API réussis**, comprenant quorums, préfixes PBFT, signatures altérées, messages malformés, ressource nulle, Merkle et garde Sepolia.
- Hardhat : **7 tests réussis**, dont rapports des trois consensus, refus des rapports incohérents et empreinte modifiée détectée.
- Seize recettes : terminaison complète, registre conservé, dernier certificat PoS/PBFT revérifié et empreinte calculée. Mesures dans artifacts/v4/scenarios-results.json, quatre exemples complets dans le même dossier.
- Slither 0.11.6 : un contrat, 102 détecteurs, zéro résultat signalé. Audit npm production : zéro vulnérabilité signalée ; alertes d’outillage documentées dans SECURITE.md.

Les logs réels sont dans artifacts/tests-v4.log, tests-v4-final.log, contracts-tests-v4.log, build-v4.log et scenarios-v4.log. La seconde vérification ciblée est un sous-ensemble des 65, pas 19 tests supplémentaires distincts.

## Vérifications navigateur

Laboratoire initial en pause, lancement/lecture accélérée et sélection de scénario ; trois machines dont une à mise nulle, dix comptes et 40 paiements ; finalité et certificat publiquement revérifié ; capture d’un rapport achevé et message MetaMask absent dans le navigateur intégré.

Comparaison Worker complète : sept honnêtes, seed 42, 90 s, 120–700 ms. PoW/PoS/PBFT retiennent chacun 40 transactions (0,444 tx/s, charge limitée). Délais médians au critère : 10,51 s / 21,71 s / 2,54 s ; messages 3 318 / 8 748 / 24 390. Les cas d’usage et limites découlent des mesures/règles, sans gagnant universel.

Miner : 9 503 hashes, N0 nonce 3 816, preuve Merkle acceptée, nonce altéré refusé. Aucun message d’erreur console relevé pendant ce parcours. La durée de calcul réelle dépend du poste et ne se compare pas aux temps simulés.

Responsive : grille de 64 machines contrôlée à un petit viewport mobile ; largeur du document égale à la largeur disponible, sans débordement horizontal. La disposition du grand réseau conserve les liaisons du nœud sélectionné. Le viewport temporaire a été remis à sa valeur normale.

## Limites de la validation

Ces tests ne constituent pas une preuve formelle des consensus ni un audit de production. Les chiffres concernent les politiques pédagogiques déclarées. La publication du site et les reçus on-chain sont des preuves distinctes.

Aucune transaction Sepolia publique n’a été envoyée : le portefeuille de l’utilisateur doit être approvisionné en ETH de test et signer personnellement déploiement/ancrage. Aucun dépôt GitHub du groupe n’est déclaré. Les configurations Render/Railway/Vercel sont fournies sans prétendre que ces comptes externes ont été déployés.
