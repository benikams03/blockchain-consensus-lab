> Document historique : pour la livraison Fusion 4, lire README.md, MODELE.md et VALIDATION_V4.md.

# Version 3 — guide de l’Atelier avancé

## Ce qui est livré

L’application React 3.0 conserve le laboratoire de référence, ses neuf scénarios, sa comparaison et ses exports. Elle ajoute cinq modules : **Miner, Miser, Relire, Mesurer, Distribuer**. Le mode de référence utilise toujours `atelier-1.0.0` ; les ateliers de preuve et d’économie sont versionnés `atelier-2.0.0`, le réseau de processus `atelier-pbft-process-1.0.0`.

Ces modes répondent à des questions différentes. Leurs mesures ne sont pas fusionnées dans un classement global.

| Mode | Ce qui s’exécute | Horloge | Accessible en hébergement statique |
|---|---|---|---|
| Laboratoire de référence | PoW probabiliste, PoS inspiré de Gasper, PBFT, réseau virtuel | Millisecondes simulées | Oui |
| Miner | Recherche effective d’un nonce et recalcul SHA-256 | Temps de calcul de l’appareil | Oui, Web Worker |
| Miser | Portefeuilles et staking virtuels, blocs et votes signés | Créneaux pédagogiques de quatre par époque | Oui |
| Relire | Recalcul indépendant d’un run de référence | Temps simulé du run enregistré | Oui |
| Mesurer | Séries de graines du moteur de référence | Temps simulé pour chaque essai | Oui, Web Worker |
| Distribuer | Une réplique PBFT par processus, réception HTTP locale | Temps réel du serveur | Non, serveur Node.js nécessaire |

## Phase A : rendre la preuve observable

### Module A1 — minage effectif

Le Worker calcule réellement `SHA256(sérialisationCanonique(en-tête))`. L’en-tête contient version, parent pédagogique, racine des identifiants de transactions, mineur, graine et nonce. Le format n’est pas celui d’un en-tête Bitcoin et le hash est un SHA-256 simple.

La difficulté autorisée vaut de un à quatre zéros hexadécimaux. La cible est construite comme `00…0ff…f` sur 64 chiffres. Le résultat doit être inférieur ou égal à cette cible. Le nombre moyen d’essais attendu est approximativement `16^d` ; cela n’impose pas le nombre réellement obtenu.

Un tirage pondéré attribue chaque tentative à un des quatre mineurs. Ils disposent de compteurs de nonce indépendants, mais un seul Worker réalise leurs calculs : le projet ne prétend pas créer quatre processeurs. La quantité de travail calculée suit les poids configurés ; le temps réel dépend de la machine.

Le budget est limité à deux millions de tentatives. Une preuve trouvée peut être exportée et vérifiée indépendamment par recalcul du hash, de la racine et de la cible attendue. Altérer le hash annoncé doit provoquer un refus. Cette vérification concerne la preuve pédagogique de cet en-tête, pas une chaîne Bitcoin complète.

**Démonstration :** ouvrir Atelier avancé → Miner, difficulté 3, seed 42, N0 à 40 %. Lancer, observer les compteurs puis vérifier la preuve. Essayer ensuite « Altérer puis vérifier ».

### Module A2 — décisions et relecture

Dans le laboratoire de référence, lancer une expérience, puis ouvrir Atelier avancé → Relire → Capturer le laboratoire. La lecture est mise en pause et l’export est copié. L’original reste indépendant.

Une nouvelle Simulation est reconstruite à partir de la configuration et de la graine. Le curseur choisit une observation significative ; le moteur est avancé jusqu’à la fin de l’événement atomique qui la contient. Plusieurs observations peuvent donc partager l’état affiché. Le texte distingue une règle applicable d’une preuve effectivement publiée dans la trace.

Exemples : travail cumulé d’une tête PoW, blocs retirés et ajoutés, quorum PBFT adapté à n, justification/finalisation PoS, livraison du marchand et remplacement du paiement. La trace v1 ne publie pas tous les poids individuels d’un certificat PoS : l’interface n’en invente pas.

Les exports de référence v1 peuvent être rechargés. L’import est borné à 20 Mo et 120 000 observations ordonnées ; le modèle et la configuration sont vérifiés. Le JSON n’est jamais exécuté. Le test de relecture vérifie l’égalité de l’état final recalculé et de l’export original.

## Phase B : relier les actifs aux décisions

### Module B1 — comptabilité

L’atelier Miser possède quatre participants, chacun doté initialement de 1 000 unités fictives. Par défaut : 800 disponibles et 200 immobilisées. Il est séparé des six comptes de paiements du laboratoire v1 ; les deux registres ne partagent pas de monnaie.

Un dépôt transfère du disponible vers l’immobilisé, sans émission. Un retrait réserve une partie de l’immobilisé ; cette réserve n’est pas une somme supplémentaire. La libération arrive à l’époque courante + 2. Les dépôts et demandes de retrait modifient les poids de l’époque suivante ; les poids déjà utilisés restent enregistrés dans l’historique.

L’invariant vérifié après chaque action est :

```text
Somme(disponible + immobilisé) = 4 000 + récompenses émises − unités brûlées
```

Une demande de retrait supérieure à l’immobilisé non déjà réservé est refusée. Les soldes et les réserves restent positifs ou nuls.

### Module B2 — politique de consensus et d’économie

Cet atelier illustre une chaîne PoS linéaire avec sélection du proposeur pondérée par les mises figées de l’époque. Il ne reproduit pas le choix de branche Gasper du laboratoire v1 et ne représente pas un réseau de quatre machines.

- Quatre créneaux forment une époque.
- Un proposeur honnête produit un bloc signé et reçoit 2 unités émises.
- À la fin de l’époque, les participants honnêtes actifs signent un lien vers le dernier bloc. Les signatures sont vérifiées et les poids proviennent de l’époque concernée.
- Un quorum d’au moins deux tiers de la mise active justifie le checkpoint. Deux justifications consécutives finalisent le checkpoint précédent.
- Un proposeur silencieux ne produit pas de bloc. Un participant silencieux perd 1 unité par époque sans vote.
- Deux propositions contradictoires signées produisent une preuve. Le modèle brûle 10 % du poids de l’époque, arrondi au supérieur ; les deux propositions sont écartées dans cet atelier.

Ces récompenses, délais et sanctions sont notre politique pédagogique, pas les paramètres économiques d’Ethereum. Les mises peuvent évoluer sous l’effet des pénalités ; un pourcentage annoncé par un preset est sa valeur initiale, pas une constante imposée.

**Démonstration :** déposer 100 unités, vérifier que l’offre ne change pas, avancer une époque pour voir le nouveau poids. Demander un retrait et avancer deux époques. Contraster les presets 20 % et 40 % silencieux. Choisir ensuite « Double proposition » et suivre la preuve et les unités brûlées.

## Phase C : mesurer plusieurs exécutions

### Module C1 — séries reproductibles

Mesurer exécute 3, 5, 10 ou 20 graines consécutives à paramètres identiques dans une série. La comparaison honnête utilise quatre nœuds et, par défaut, 48 secondes pour tous les mécanismes. Les durées 24, 48 ou 90 secondes sont sélectionnables ; une série courte peut ne pas observer de finalité PoS. La série de double dépense utilise sept nœuds et 90 secondes, avec puissance contrôlée et nombre de confirmations réglables.

Le moteur de référence reste identique. Le Worker calcule les essais hors du thread d’interface et peut être annulé. Une annulation n’affiche pas un échantillon incomplet comme une série terminée.

Les agrégats indiquent essais complets et partiels, TPS médians, P10–P90, médiane des délais médians disponibles, absence de délai au critère et messages médians. Les traces arrêtées par limite sont exclues des statistiques principales. Un délai absent n’est jamais remplacé par zéro.

Pour les attaques, l’intervalle de Wilson à 95 % décrit l’incertitude de la fréquence observée dans cet échantillon. Il ne constitue pas une probabilité universelle d’attaque. Un petit échantillon donne un intervalle large. Les quantiles P10–P90 sont une dispersion empirique, pas un intervalle de confiance.

**Démonstration :** lancer trois graines pour une comparaison, exporter les résultats. Pour étudier les confirmations, exporter une série de double dépense avec k = 2 puis refaire les mêmes graines et paramètres avec k = 6. Comparer aussi les non-abouties et les garanties, pas uniquement la médiane.

## Phase D : répliques indépendantes et fautes

### Module D1 — processus et transport

Distribuer démarre quatre ou sept processus Node.js enfants. Chaque processus détient un seul NodeState, son registre, ses blocs reçus, ses signatures, ses certificats et ses journaux PBFT. Le module de consensus ne reçoit aucune référence aux états des autres répliques. Les processus utilisent le même compte système : cette séparation d’exécution et de mémoire ne constitue pas un cloisonnement de sécurité contre du code arbitraire.

Le parent pilote le routage et les délais. Les émissions passent du processus au pilote par IPC ; les livraisons sont des requêtes HTTP vers le récepteur de la réplique destinataire, sur un port local distinct. La table affiche les PID et ports. C’est une expérience de processus et d’échanges HTTP réels sur une seule machine, pas un déploiement de conteneurs ou de machines géographiquement séparées.

Les blocs, votes et changements de vue utilisent le module PBFT existant. Deux trames alternées, numérotées et munies d’une empreinte, sont synchronisées sur disque avant les émissions signées, puis après les traitements. Un redémarrage recharge le journal et réarme les délais. La synchronisation échange des certificats et les blocs manquants.

### Module D2 — perturbations disponibles

- Leader silencieux : absence de proposition et remplacement par changement de vue.
- Propositions contradictoires : le leader signe deux propositions différentes pour une même séquence et les distribue à des groupes distincts.
- Votes retenus : absence d’émission PREPARE/COMMIT du participant contrôlé.
- Signatures invalides : messages transmis puis refusés à la réception.
- Panne : arrêt d’un processus ; redémarrage depuis son journal local.
- Partition : pertes entre deux groupes, puis rétablissement des liens.
- Rejeu : livraison supplémentaire d’un message déjà émis ; le filtrage des identifiants évite de recompter le même message.

L’API limite à une expérience de processus à la fois, quatre ou sept nœuds et 60 secondes maximum ; l’interface utilise 30 secondes. Les commandes sont protégées par une capacité aléatoire et un identifiant d’idempotence. Les processus sont arrêtés automatiquement et lors de la libération du run. Les journaux locaux sont exclus du dépôt et de l’archive.

**Démarrage :** `npm ci`, `npm run build`, `npm start`, puis ouvrir l’URL affichée et Atelier avancé → Distribuer. Utiliser l’adresse de ce serveur. Une interface Sites statique ne peut pas créer des processus ; elle affiche ce prérequis au lieu de simuler une réussite.

**CLI :** `npm run distributed -- --fault equivocate --duration 12000`. Le rapport est écrit dans `artifacts/distributed-report.json`.

## Règles d’équipe pour cette édition

1. Conserver le moteur et les neuf recettes v1 comme référence reproductible.
2. Nommer le modèle et l’horloge dans tout export ; ne pas mélanger calcul réel et temps simulé.
3. Ne jamais créer un solde lors d’un dépôt ; compter explicitement récompenses et destructions.
4. Figer les poids par époque et vérifier les anciens votes avec leur photographie de mises.
5. Ne jamais attribuer un succès d’attaque au seul dépassement d’un pourcentage.
6. Les explications citent les données disponibles et signalent les preuves absentes de la trace.
7. Un processus possède un état local ; le pilote de transport ne décide pas des engagements.
8. Garder les clés, actifs et signatures de démonstration hors de tout usage financier.
9. Documenter les nouvelles politiques et tester conservation, quorums, rejets, relecture et fermeture des ressources.

## Quatre lots de lecture et de réalisation

1. Socle et minage : primitives, preuves SHA-256, réseau v1 et PoW de référence.
2. PoS et économie : portefeuilles, poids par époque, votes, finalité et sanctions.
3. Analyse et protocoles : relecture, causalité, séries, métriques et tests PBFT.
4. React et exécution : composants, Workers, API, processus, responsive et livraison.

Le chef de groupe peut réaliser les quatre lots successivement. Les contributions universitaires déclarées doivent correspondre au travail réellement effectué.
