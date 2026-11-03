# Démonstration et maîtrise — Fusion 4

## Introduction à dire

« Notre application explique comment des machines aux informations locales différentes construisent un historique commun. Nous simulons propagation, production et adversaires ; nous distinguons confirmations PoW, finalité PoS et engagement PBFT. Nous ajoutons un calcul PoW vérifiable et l’ancrage d’un rapport sur Sepolia. »

## Première démonstration : le rôle n’est pas le nombre total

Choisir 10 nœuds, puis 3 mineurs ; montrer les 7 suiveurs bleus sans découvertes. Refaire en PoS avec 3 validateurs et ouvrir les votes pour vérifier leurs seules signatures. En PBFT, choisir 10 nœuds et 4 répliques : 6 suiveurs, quorum 3. Couper deux votants bloque malgré huit machines encore présentes ; couper des suiveurs ne supprime aucune voix. Le guide ROLES_NOEUDS.md donne le parcours complet et les exemples d’API.

## Parcours de 12 à 15 minutes

1. **Honnête** : lancer la naissance d’un accord, seed 42, 7 nœuds, latence 120–700 ms, PoW 4 s, 90 s simulées, 40 paiements maximum. Montrer une transaction, son nonce et le registre du nœud. Pause et pas changent l’observation, pas les règles.
2. **Latence/fourches** : recette « Deux blocs. Une place. », seed 17, latence 700–2800 ms, PoW 2 s. Lire les blocs de même parent et réorganisations. Pour isoler le seul effet de latence, refaire avec la même seed/rythme, en abaissant seulement les bornes à 120–700 ; la comparaison de deux recettes différentes n’isole pas une cause.
3. **Double dépense** : seed 7, N0 à 65 %, k=2, début 6 s, paiement public 6,15 s, publication 45 s. Dans Fusion 4, livraison mesurée à **17,054 s**, publication à **45 s**, réussite à **45,574 s**. Montrer deux paiements de même nonce, le conflit retenu et le solde marchand revenu à 1 000. Refaire k=6 : pas de livraison dans cette expérience, donc pas de double dépense réussie. Ne pas promettre une protection universelle avec six confirmations.
4. **51 % sans paiement conflictuel** : majorité, seed 7, 65 %. La réorganisation peut réussir sans être une double dépense. La ressource est la puissance, pas un vote par machine.
5. **PoS** : comparer 20 % et 40 % contrôlés, seed 42, 7 nœuds, slots 3 s, 4 slots/époque. À 20 %, hauteur finalisée 24 ; à 40 %, zéro, malgré des blocs produits. Ouvrir un certificat, ses signataires et sa vérification. Montrer « Signé ne veut pas dire envoyé » et expliquer les réceptions locales.
6. **PBFT** : 4 machines, un leader silencieux dès zéro, quorum 3. Changement de vue à environ 5,948 s pour N1 et reprise. Avec 7 machines et deux leaders silencieux : f=2, quorum 5, vue suivante jusqu’au leader honnête. Partition 2+2 de 6 à 45 s : aucun groupe n’a trois voix ; après guérison, reprise et récupération des paiements.
7. **Byzantin actif** : « Le leader parle en deux versions ». Deux blocs même vue/séquence, preuve de faute ; les honnêtes ne préparent pas deux digests. « Une voix sans signature valide » montre que recevoir n’est pas accepter.
8. **Calcul et actifs** : Miner, difficulté 3, seed 42, puissances [40,20,20,20]. Preuve pédagogique trouvée après 9 503 essais, N0 nonce 3 816 ; recalculer puis altérer nonce/Merkle. Miser : déposer sans création monétaire, franchir une époque pour le poids, demander un retrait différé et montrer une sanction. Modèles distincts du réseau comparatif.
9. **Comparer et ancrer** : sept honnêtes, même charge/latence/capacité. Lire tableau, diagramme et interprétations ; le meilleur mécanisme dépend du besoin. Terminer une expérience, conserver le JSON, connecter MetaMask Sepolia, ancrer puis vérifier sans portefeuille. Le déploiement et l’ancrage publics nécessitent vos signatures et ETH de test.

## Trois expériences pour montrer les apports du camarade

« Vérifier sans miner » et « Vérifier sans mise » : 3 machines, ressources [80,20,0], 10 comptes. N2 suit/vérifie sans produire/voter. Modifier une ressource ou une panne dans Participants puis Appliquer recrée l’expérience ; ce n’est pas une modification rétroactive.

« La mise devenue absente » : [40,20,20,20], N0 hors ligne. Les 60 % présents peuvent produire sans atteindre les deux tiers. La mise absente reste dans le total. Le nombre de machines et le nombre de détenteurs de ressources ne se confondent pas.

## Réponses courtes aux questions du professeur

- **Le problème PoW existe-t-il ici ?** Oui dans Miner : recherche de nonce sous cible par SHA-256. Le réseau principal utilise une attente exponentielle par mineur pour reproduire statistiquement la course et les délais sans bloquer le navigateur.
- **Comment devient-on mineur ?** Machine configurée en ligne avec puissance positive. Le mineur qui a la découverte la plus tôt programmée produit sur sa tête locale ; les autres vérifient avant adoption.
- **Comment le validateur voit-il les actifs ?** Chaque machine possède la même liste de mises déclarées et clés liée au domaine de l’expérience. C’est un registre de mises fictif et fixe, pas une lecture du solde MetaMask.
- **Le plus riche gagne-t-il toujours ?** Non, sa probabilité augmente ; le ticket pondéré varie selon seed/créneau. Une mise nulle ne gagne pas. Un proposeur absent peut manquer un slot.
- **Pourquoi finalité distincte de production ?** La tête suit les blocs/votes ; la finalité exige un certificat de deux tiers entre checkpoints admissibles. Des blocs peuvent s’accumuler pendant le blocage du quorum.
- **Byzantin veut-il dire hors ligne ?** Non : silence, rétention, contradiction et signature invalide sont différents comportements. PBFT vise la cohérence malgré au plus f fautes, pas seulement les pannes.
- **Pourquoi 3f+1 ?** Deux quorums de 2f+1 parmi 3f+1 se croisent en au moins f+1 identités, donc au moins une honnête si au plus f sont byzantines. Les verrous et preuves de changement de vue doivent préserver cet argument.
- **Le smart contract exécute-t-il les consensus ?** Non : il enregistre une déclaration d’auteur, son résumé et l’empreinte du rapport. Les votes et résultats sont produits/vérifiés hors chaîne.
- **Peut-on dépenser deux fois dans un bloc valide ?** Non : le nonce interdit les deux paiements incompatibles dans une branche. L’attaque remplace la branche après acceptation commerciale.
- **Ajouter des nœuds rend-il plus rapide ?** Pas automatiquement : ressources normalisées, propagation et volume des échanges interviennent ; PBFT change aussi quorum et coût des messages.

## Ce qu’il faut éviter d’affirmer

Ni « notre PoS est Ethereum complet », ni « 51 % garantit chaque course », ni « aucun message reçu ne peut être invalide », ni « finalité en PoW », ni « le hash prouve que notre simulation est vraie ». Ne pas annoncer GitHub, Sepolia ou un hébergeur demandé avant un lien réel. Les résultats de cette édition se reproduisent avec son modèle, ses réglages et sa seed ; ne pas réutiliser les anciennes heures de V3.

Références : Bitcoin (Nakamoto), Gasper (Combining GHOST and Casper), PBFT (Castro et Liskov, OSDI 1999). Liens dans l’onglet Comprendre.
