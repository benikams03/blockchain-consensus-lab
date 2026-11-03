# Règles et calculs — Fusion 4.1

## Réseau N et comité K

Le total des machines nodeCount et la liste consensusNodes sont distincts. Seuls les membres choisis produisent/votent ; les autres suivent et vérifient. En PBFT, n=K=3f+1 et quorum=2f+1 ; N inclut aussi les suiveurs. Une panne ne modifie pas le rôle ni le dénominateur de mise. Consulter ROLES_NOEUDS.md pour les exemples et l’API.

## Machines, comptes et temps

PoW/PoS : 1–64 machines, 2–100 comptes indépendants. Chaque compte démarre à 1 000 unités, conservées dans le réseau comparatif sans frais/récompense. Le nombre de paiements demandé est un maximum : émissions à partir de 1 s, espacées de txInterval et bornées par la fenêtre. La double dépense conserve ses deux paiements essentiels même si la charge ordinaire est nulle.

Les ressources sont entières ; zéro conserve la vérification sans production/vote. Les ressources manuelles priment sur le curseur. Le premier membre sélectionné est l’attaquant PoW ; les premiers faultyNodes membres sont contrôlés pour les fautes byzantines. Dans les recettes par défaut, il s’agit bien de N0 puis des identités suivantes. Une panne ne retire pas la mise du total configuré. Temps en ms et ordre stable des événements simultanés. Latence uniforme entre les bornes, topologie complète. La partition perd les messages entre groupes ; guérison et synchronisations permettent la récupération.

## Transactions et création de bloc

Un paiement comporte expéditeur, destinataire, montant entier, nonce, identifiant et signature Ed25519. Chaque branche a ses soldes et prochains nonces. Le nonce exact est requis à l’exécution ; un nonce ultérieur peut attendre. Le producteur choisit au plus capacity transactions exécutables sur l’état du parent. Un bloc invalide ne modifie pas ce parent ; un parent manquant doit être récupéré.

L’identifiant lie en-tête et ordre des transactions. Signature, producteur et règles sont contrôlés avant adoption. Les signatures sont réelles mais leurs clés de démonstration sont publiquement reproductibles : elles illustrent l’authentification sans sécuriser de vrais fonds contre un utilisateur qui possède le code.

## PoW : comment le mineur gagne

Attente par mineur admissible i :

`Di = max(1, arrondi(−ln(1−Ui) × T × W / wi))`

T : intervalle PoW réglé ; wi : puissance du mineur ; W : somme des puissances déclarées ; Ui : tirage dérivé de SHA-256 sur version/seed/identité/compteur. Le premier événement programmé produit un bloc sur sa tête locale. **Aucun second tirage ne choisit le gagnant.** Ce mineur programme sa prochaine découverte. Un mineur hors ligne ne participe pas ; sa puissance ne se redistribue pas.

Chaque bloc vaut une unité de travail. La tête maximise le cumul des branches connues localement. À égalité, garder la tête si elle est parmi les meilleures, sinon départager par identifiant. Changer de branche retire/ajoute des blocs et recalcule le registre. Confirmations = hauteurTête − hauteurPaiement + 1 : le bloc du paiement compte.

Le réseau simule le hasard à difficulté constante, sans boucle coûteuse de nonce. Dans **Miner**, le vrai calcul est SHA256(en-tête canonique avec nonce), cherchant un digest <= cible. Difficulté d zéros hexadécimaux : chance approximative 1/16^d par essai. La puissance distribue les essais et chacun a son nonce. La preuve lie parent/mineur/nonce/cible/racine Merkle. Le chemin Merkle prouve l’appartenance d’un identifiant sans fournir toute la liste. Ce format n’est pas l’en-tête ni le double SHA-256 de Bitcoin.

## Fourche, 51 % et double dépense

Fourche = branches valides divergentes ; réorganisation = changement effectivement adopté par un nœud. Deux blocs de même parent peuvent apparaître sans attaque avec une propagation lente. Le graphe garde les branches abandonnées pour enseigner sans alimenter les décisions.

51 % concerne la puissance, pas le nombre de machines. Recette à 65 % : N0 mine publiquement avant 6 s, puis démarre une branche privée sur sa tête locale, publiée à 45 s. Les honnêtes reçoivent, vérifient et comparent le travail cumulé. La majorité favorise une longue course sans garantir chaque fenêtre ; elle ne permet ni de signer pour un tiers ni de rendre un paiement invalide acceptable.

Mallory signe deux paiements de nonce 0 : 80 au marchand et 80 vers lui-même en privé. Introduction privée à 6 s, publique à 6,15 s. Le marchand livre après k confirmations. **Réussite du scénario** : livraison antérieure, paiement public absent, conflit présent et lui-même confirmé à k. Publication ou fourche seules ne suffisent pas. Les deux paiements ne coexistent jamais dans une branche valide : le risque vient de son remplacement après livraison.

## PoS : actifs et sélection

Les mises sont validators[].stake, figées au lancement, sans lien avec MetaMask ni les comptes de paiement. Elles sont liées aux clés/configuration par le domaine signé de l’expérience : seed, calendrier, capacité et état initial. Une modification des mises déclarées doit invalider les preuves existantes.

Pour le créneau s, SHA-256 donne un entier 256 bits sur version/seed/s/compteur. On rejette les valeurs hors de la plus grande plage divisible par la mise totale S, puis le ticket valeur mod S tombe dans un intervalle cumulé, après tri des identités. Avec [80,20,0], N0 a 80 tickets, N1 20 et N2 aucun. Ce calendrier public reproductible simplifie l’aléa Ethereum. Si le choisi est absent, son créneau peut être manqué sans remplaçant tiré après coup.

Le proposeur construit un bloc avec sa mémoire locale ; les autres vérifient et signent votes de tête/liens de finalité. Signé, envoyé, reçu et utilisé diffèrent : un vote retenu peut être signé ; une réception ne compte qu’après authentification et validation locale de ses références. L’inspecteur montre ces étapes.

## PoS : tête et finalité

LMD-GHOST part d’un checkpoint justifié compatible avec la finalité puis descend dans le sous-arbre au poids de derniers votes admissibles maximal. Un vote récent remplace l’ancien ; une retransmission ne multiplie pas le poids.

Une époque contient epochLength créneaux. Son checkpoint est le dernier bloc admissible **avant** sa frontière, éventuellement un ancêtre/genesis si des créneaux manquent. Un bloc créé sur la frontière ne devient pas rétroactivement ce checkpoint. Un certificat source-cible exige signataires distincts, même lien, source déjà justifiée, filiation et checkpoints valides, et `3 × poids >= 2 × miseTotale`. Il justifie la cible ; pour des époques adjacentes, il peut finaliser sa source. Une tête récente n’est donc pas forcément finalisée.

40 % qui retiennent leurs votes laissent 60 % honnêtes, insuffisants pour de nouvelles finalisations. Avec 20 %, les 80 % peuvent atteindre le quorum. Fautes : double proposition, double vote et votes entourants. Deux liens du même auteur s’entourent si source1 < source2 < cible2 < cible1. Les preuves sont signées/inspectables ; le réseau ne confisque pas de fonds. **Miser** est une économie séparée : dépôt, retrait différé, poids par époque, récompenses et destruction comptable. Ses taux pédagogiques ne sont pas ceux d’Ethereum.

## PBFT : principe byzantin

Comité fixe n=4/7/10, f=(n−1)/3, quorum 2f+1=3/5/7. Leader de vue v : N(v mod n). PRE-PREPARE propose un bloc dont hauteur=séquence et parent=dernière décision locale. Un honnête ne prépare pas deux digests à la même vue et séquence.

Proposition valide + **2f PREPARE de secours distincts** = préparation ; la réplique envoie COMMIT. **2f+1 COMMIT authentifiés** du même digest/vue/séquence engagent le bloc et sont conservés en certificat. Une copie en retard vérifie les certificats et récupère les parents. Un doublon ne crée aucune voix.

Après délai, VIEW_CHANGE porte la préparation pertinente. f+1 demandes peuvent entraîner une copie dans le changement ; 2f+1 preuves permettent NEW_VIEW, en préservant la préparation de vue la plus élevée. Le délai croît avec la vue, avec une borne dans ce modèle. Sécurité : au plus f fautes ; progression : connectivité/délais suffisants en plus. Une partition 2+2 sur quatre n’a aucun quorum de trois et peut arrêter les engagements.

Fautes réglables : leader silencieux, silence complet, PREPARE/COMMIT retenus, propositions contradictoires distribuées aux voisins, signatures invalides rejetées. Au-delà de f contrôlés, l’interface indique que la garantie n’est plus couverte. Les tests vérifient progression et préfixes engagés compatibles sous ces cinq comportements avec un fautif sur quatre.

## Mesures

Observateur fixé au départ : premier honnête en ligne si possible, sinon copie disponible. Cliquer un nœud change seulement l’inspection. Compteurs issus de sa branche courante. Débit = transactions retenues/temps écoulé ; délais de première inclusion pour les transactions encore retenues, puis critère de décision atteint. Absence de décision = null, jamais zéro.

Messages = envois dirigés et retransmissions. Une limite d’événements/trace rend le résultat partiel explicite. Comparaison : sept honnêtes à poids égaux, même charge/capacité/latence, rythmes propres annoncés. Confirmer, finaliser et engager diffèrent. Aucun classement universel ni mesure d’énergie ne découle d’une seed.
