# Validation de la séparation des rôles — Fusion 4.1

Version : atelier-fusion-4.1.0. Date : 2 novembre 2026.

## Tests exécutés

Parcours complet npm test : **68 tests**, puis **6 tests de processus**, tous réussis, aucun échec. Les neuf tests de rôles sont inclus dans ces 74 tests ; ils ont aussi été rejoués séparément après les derniers ajustements. Les sept tests de contrat passent aussi, soit 81 tests distincts réussis au total. Le contrôle ciblé de certificat PoS inclut le rejet d’un comité déclaré modifié. Les journaux sont dans artifacts/*v4.1.log. Aucune transaction Sepolia publique n’est nécessaire à ces tests.

Les neuf cas vérifient : séparation réseau/comité, tableaux et ressources, part contrôlée sur les seuls producteurs, mineurs non contigus, validateurs non contigus et vote de suiveur sans effet, comités PBFT de quatre et sept au sein de douze machines, faux quorum de signatures de suiveurs, pannes de votants/suiveurs et rotation des seuls membres.

En particulier, douze machines dont quatre répliques exigent trois COMMIT ; douze dont sept répliques exigent cinq COMMIT. Les suiveurs n’émettent ni PREPARE, ni COMMIT, ni VIEW_CHANGE. Ils vérifient et installent les décisions certifiées. Une panne de tous les suiveurs n’empêche pas un comité opérationnel de progresser ; deux votants disponibles sur quatre ne peuvent pas être remplacés par les suiveurs encore en ligne.

## Rapports de démonstration

node scripts/validate-roles.mjs produit artifacts/v4.1/ : dix nœuds dont trois mineurs PoW, dix dont trois validateurs PoS, dix dont quatre répliques PBFT. Chaque exécution est complète, ses copies suiveuses progressent et le dernier certificat PoS/PBFT est revérifié. Les fichiers conservent configuration, liste explicite du comité, trace, copies locales et empreinte canonique.

Les archives 4.0 restent dans artifacts/v4/ avec leur modèle d’origine. Les modifications de rôles doivent être interprétées avec les paramètres et la version du rapport, sans reprendre arbitrairement les chiffres d’une autre configuration.

## Limites conservées

Une identité de consensus par machine participante, comité fixe pendant une expérience, simulation de course PoW à difficulté fixe et calcul SHA-256 dans l’atelier séparé. Les clés de démonstration sont publiques. La connexion MetaMask et les actifs Sepolia sont distincts des ressources fictives du réseau.

Le contrat Solidity V2 est inchangé. Son ancrage public reste à signer après financement du portefeuille de test ; cette mise à jour ne prétend pas l’avoir déployé. Les documents de conformité et de sécurité de la livraison précédente restent applicables à ces points.

## Contrôle de l’interface

Trois réglages vérifiés : 10 machines / 3 mineurs ; 10 / 3 validateurs ; 10 / 4 votants PBFT. Le nœud suiveur N7 reçoit les blocs, affiche zéro mise en PoS et « aucune voix » en PBFT. Un certificat PoS à 20 000/30 000 unités et un certificat PBFT de trois signataires ont été vérifiés depuis cette copie sans contribution de sa part. Les captures sont dans artifacts/v4.1/. Aucun message d’erreur de l’application relevé dans ce parcours.
