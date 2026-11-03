# Sécurité — Fusion 4

Projet pédagogique, pas garantie de production. Identités simulées publiques et reproductibles, distinctes de MetaMask. Les fichiers privés d’identité du ZIP du camarade n’ont pas été intégrés.

## Contrat et menaces

ResultsRegistry n’a ni administrateur, mise à niveau, transfert de fonds ni appel externe. msg.sender fixe l’auteur ; identifiant lié à auteur/empreinte. Protocoles 0/1/2, 1–64 nœuds, 1–1000 blocs, 0–1000 transactions, au critère <= retenues, durée positive <=30 jours. Pas de réécriture. Événement pour l’audit. Pas de fonction payable ; aucun point d’appel externe pour une réentrance dans cette version.

L’adresse du publiant est publique ; comptes fictifs et votes restent hors chaîne. Garder le fichier est indispensable. Un auteur peut déclarer un résultat faux : le contrat ne valide pas le moteur. Reproduction et certificats se vérifient séparément.

## Contrôles exécutés

- Hardhat : identité V2, auteur/événement, bornes, immutabilité, isolation des auteurs, refus d’ETH, rapports des trois protocoles et altérations.
- Slither 0.11.6 : **1 contrat, 102 détecteurs, 0 résultat signalé** ; artifacts/slither-results.json et slither.log. Ce n’est ni une preuve formelle ni un audit professionnel.
- npm : aucune vulnérabilité signalée dans les dépendances de production lors du contrôle (npm-audit-production.json). Des alertes transitives subsistent dans l’outillage Hardhat 2/solc/Mocha ; rapport complet npm-audit.json. Ne pas l’exposer comme service traitant du code non fiable. Planifier une migration testée plutôt qu’un audit fix forcé.
- Moteurs : signatures/nonces, ordre des checkpoints, messages malformés, conservation des comptes, ressources nulles, certificats altérés, préfixes PBFT et partition/reprise.

Les résultats et avis npm peuvent évoluer ; refaire le contrôle avant une autre publication. Aucun portefeuille financé n’est requis pour les tests locaux.

## Application et limites

Contrôles : type/taille/domaine/signature, parent, soldes/nonces, proposeur, quorum et source justifiée. Un vote répété ne multiplie pas le poids. Les clés de démonstration ne résistent pas à quelqu’un qui en exécute le générateur public : aucune valeur réelle ne doit en dépendre.

API : requêtes/WebSocket/session/journal bornés, jetons aléatoires, CORS restreint, commandes idempotentes. Avant une production ouverte : authentification, quotas, expiration adaptée, supervision, protection déni de service et HTTPS/WSS. Les routes de processus ne sont pas activées par défaut en hébergement public.

DApp : écritures Sepolia uniquement, compte/réseau revérifiés, réussite après confirmation. RPC de lecture configurable et chaîne vérifiée ; sa disponibilité/réponse reste un point de confiance. Pour un contrôle critique, confronter avec explorateur ou second RPC. Aucun secret de portefeuille n’est lu par l’application.

## Reproduire Slither

Installer Slither dans un environnement Python séparé, compiler le contrat puis :

```sh
slither . --compile-force-framework hardhat --hardhat-ignore-compile --hardhat-cache-directory .local/hardhat-cache --hardhat-artifacts-directory smart-contracts/artifacts --json artifacts/slither-results.json
```

L’environnement Python utilisé n’est pas inclus dans l’archive. Les fichiers artifacts sont les preuves publiques de contrôle.
