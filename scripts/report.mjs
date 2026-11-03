import {readFile,writeFile} from 'node:fs/promises';
const {results}=JSON.parse(await readFile('artifacts/experiments.json','utf8'));
const rows=results.map(({protocol,seed,metrics:m})=>`| ${protocol.toUpperCase()} | ${seed} | ${m.blocks} | ${m.transactions} | ${m.tps.toFixed(3)} | ${(m.medianInclusion/1000).toFixed(3)} | ${(m.medianSettlement/1000).toFixed(3)} | ${m.messages} | ${m.unfinished} |`).join('\n');
await writeFile('docs/RESULTATS.md',`# Validation et résultats observés

Validation réalisée le 29 octobre 2026. Modèle atelier-1.0.0, sélection FIFO locale, poids fixes. Données brutes : artifacts/experiments.json.

## Vérifications effectivement exécutées

- npm run check : vérification TypeScript stricte réussie.
- Vérifications actuelles : voir [VALIDATION_V3.md](VALIDATION_V3.md). Les mesures ci-dessous utilisent le moteur de référence inchangé.
- npm run build : construction réussie du serveur et de l'interface.
- npm run experiments : **9 expériences terminées** (3 protocoles x seeds 7, 19, 42).
- Contrôle navigateur : lecture, vitesse, soldes locaux, comparaison en Worker et activation du moteur serveur WebSocket.
- Contrôle responsive : ordinateur 1440 px et mobile 390 px ; aucun débordement horizontal observé sur la vue laboratoire.

Ces vérifications ne constituent pas une preuve formelle de consensus ni un audit professionnel.

## Conditions expérimentales

7 nœuds honnêtes ; 60 secondes simulées ; délais uniformes 120-700 ms ; 5 transactions par bloc ; émission toutes les 1,6 s. PoW : intervalle moyen 4 s et 3 confirmations. PoS : créneaux 3 s, 4 créneaux par époque. PBFT : rythme déterminé par les phases et l'engagement. Les rythmes de production ne sont pas normalisés : ce sont des expériences du modèle, pas un classement universel.

| Mode | Seed | Blocs | Tx retenues | Tx/s | Inclusion médiane (s) | Critère médian (s) | Messages | Tx non abouties |
|---|---|---|---|---|---|---|---|---|
${rows}

Le critère correspond à 3 confirmations en PoW, à la finalité pédagogique en PoS et à l'engagement en PBFT. Les niveaux de garantie diffèrent. Les délais sont calculés sur les transactions retenues ayant atteint le critère ; les non-abouties restent publiées pour éviter un biais de lecture.

## Interprétation

Dans ces conditions, la charge offerte est proche de 0,625 transaction par seconde. Un débit utile proche de 0,6 ne prouve donc pas une capacité maximale du protocole : le réseau n'est pas soumis à un test de saturation systématique.

PBFT échange davantage de messages, notamment à cause des phases et des retransmissions de certificats. Le PoS distingue production des blocs et finalité des points de contrôle ; le délai au critère est donc supérieur à celui de l'inclusion. Les seeds font varier les découvertes PoW et les délais de propagation.

Trois seeds ne suffisent pas à estimer précisément une probabilité d'attaque. Pour une étude statistique, augmenter le nombre d'essais, varier une seule condition à la fois et rapporter l'incertitude.

## Scénario de double dépense vérifié

PoW, seed 7, part contrôlée 65 %, deux confirmations demandées, publication de la branche privée à 45 s. Le marchand a livré à **43,245 s simulées**, puis son paiement a été retiré et la dépense incompatible retenue. Le test vérifie le retour du solde du marchand à 1 000 unités et la présence de réorganisations. Ce résultat est obtenu par les événements, pas par un oracle fondé sur le pourcentage.

## Captures

Voir artifacts/laboratoire-desktop.png, laboratoire-mobile.png et comparaison-desktop.png. Les captures documentent l'affichage ; les JSON et tests fondent les résultats numériques.
`);
await writeFile('docs/RAPPORT_PROJET.md',`# Simulateur pédagogique de consensus : PoW, PoS et PBFT

## Présentation

Ce prototype web rend visibles les décisions locales de participants qui reçoivent des informations avec des délais différents. Il vise à expliquer les garanties et compromis des consensus en faisant varier les ressources, les conditions réseau et les comportements.

Équipe : compléter les quatre noms et les contributions réelles avant remise. Le chef de groupe peut réaliser les phases successivement ; le projet reste segmenté en quatre lots complémentaires pour la lecture et la relecture.

## Problématique

Comment une simulation interactive permet-elle de comprendre et comparer la construction d'un historique commun, les fourches, la finalité et les réactions aux comportements malhonnêtes dans trois modèles de consensus ?

## Objectifs

Observer propositions, messages et décisions ; distinguer validation et consensus ; reproduire une expérience avec une seed ; illustrer la double dépense et les fautes byzantines ; mesurer les délais et les échanges sans confondre les garanties.

## Fondements

Le registre applique des transactions autorisées par signature. Les soldes et nonces interdisent deux dépenses incompatibles dans une même branche. La signature ne prouve pas que les fonds n'ont jamais été dépensés : le consensus doit aussi permettre de retenir un historique.

PoW utilise des découvertes proportionnelles à une ressource de calcul et retient le travail cumulé. Le modèle PoS distingue choix de branche et finalité par votes de points de contrôle. PBFT réunit des preuves d'accord entre identités fixes sous une borne de fautes. Le fonctionnement détaillé et les limites sont présentés dans MODELE et les README des modules.

## Conception

Une horloge virtuelle ordonne les événements. Chaque participant conserve un registre et des connaissances locales ; les messages ne produisent leurs effets qu'après livraison. Le moteur est partagé entre navigateur et serveur Node.js. D3 représente nœuds et blocs ; un Worker calcule les comparaisons. Le WebSocket relie le serveur à l'interface, sans transformer les objets simulés en machines indépendantes.

Le registre commun, la validation atomique, les événements ordonnés et les configurations figées évitent les incohérences entre modules. Les décisions d'architecture sont détaillées dans ARCHITECTURE.

## Réalisation et vérification

Le projet est réalisé en TypeScript avec signatures Ed25519 de démonstration, sérialisation canonique, tests Node et construction esbuild. L’interface React conserve neuf scénarios et ajoute cinq ateliers avancés. Quarante-sept tests vérifient des propriétés observables, notamment la conservation des soldes, les signatures altérées, la reproductibilité, les certificats PBFT, la partition et la double dépense.

## Résultats

Neuf expériences de référence ont été exécutées avec 7 honnêtes, 60 secondes simulées et trois seeds. Les valeurs complètes et leur interprétation figurent dans RESULTATS et dans l'export JSON. La charge faible ne permet pas d'inférer une capacité maximale ; les trois critères de décision ne sont pas équivalents.

## Limites et sécurité

PoW ne calcule pas de véritable preuve de travail. PoS ne reproduit pas toute la spécification Ethereum. PBFT utilise des participants fixes et conserve les journaux. Les clés sont publiquement reproductibles et réservées à des comptes fictifs. Le serveur conserve les sessions en mémoire. Les tests ne remplacent pas une preuve formelle ni un audit de production.

## Déploiement et remise

L'interface est construite dans dist/ et peut être publiée sur Vercel. Le serveur Node.js et son WebSocket sont préparés pour Render ou Railway, avec configuration d'origine. La prévisualisation Sites peut être privée ; elle ne doit pas être présentée comme un lien public d'examen. Voir DEPLOIEMENT pour les étapes réellement restantes sur les comptes d'hébergement.

L'application spécifique des exigences générales de contrat intelligent ou blockchain autonome déployée doit être établie avec l'enseignant. Aucun contrat ni réseau réel non réalisé n'est déclaré ici.

## Perspectives

Étendre le nombre de seeds et les charges, introduire une bande passante limitée, ajouter des sanctions et poids évolutifs au modèle PoS, documenter une reconfiguration PBFT et étudier un réseau de processus réellement indépendants. Chaque extension doit préciser ses hypothèses et ajouter des vérifications utiles.

## Références

- Bitcoin Developer Guide : https://developer.bitcoin.org/devguide/block_chain.html
- Ethereum, Gasper : https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/gasper/
- Castro et Liskov (1999), Practical Byzantine Fault Tolerance : https://www.usenix.org/legacy/publications/library/proceedings/osdi99/full_papers/castro/castro_html/node4.html

Ce rapport sert de base rédactionnelle à personnaliser et à expliquer oralement. Il ne remplace pas la maîtrise du code et des hypothèses par les membres du groupe.
`);
console.log('Résultats et base de rapport générés à partir des neuf expériences.');
