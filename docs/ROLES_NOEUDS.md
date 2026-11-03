# Nœuds, mineurs, validateurs et répliques — Fusion 4.1

Votre distinction est correcte : **vérifier un bloc n’est pas participer à sa production ou voter dans le consensus**. Dans le simulateur, un nœud suiveur reçoit et vérifie la chaîne, les paiements et les preuves d’accord, sans ajouter de puissance ni de voix.

Ethereum distingue lui aussi le nœud et le client validateur optionnel : [architecture des nœuds](https://ethereum.org/developers/docs/nodes-and-clients/node-architecture). Une machine réelle peut héberger plusieurs identités de validateur ; notre modèle simplifie à une identité de consensus par machine participante. Pour PBFT, le comité des répliques est distinct des clients/observateurs : [Castro et Liskov, OSDI 1999](https://www.usenix.org/conference/osdi-99/presentation/practical-byzantine-fault-tolerance).

## Deux nombres, deux fonctions

**N** = toutes les machines du réseau. **K** = machines désignées pour le consensus, parmi ces N. Les N−K autres sont des suiveurs. Ces rôles sont fixés au lancement de chaque expérience, sans admission dynamique pendant la lecture.

| Exemple | Total N | Participants K | Suiveurs | Règle de décision |
|---|---|---|---|---|
| PoW | 10 | 3 mineurs | 7 | course pondérée entre les 3 mineurs ; travail cumulé |
| PoS | 10 | 3 validateurs | 7 | sélection et votes selon la mise des 3 validateurs |
| PBFT | 10 | 4 répliques votantes | 6 | f=1 ; quorum de 3 COMMIT |
| PBFT | 12 | 7 répliques votantes | 5 | f=2 ; quorum de 5 COMMIT |

Les suiveurs ne sont pas des votants supplémentaires. Dix nœuds dont quatre répliques PBFT ne donnent pas un quorum de sept : la formule porte sur **n=K=3f+1**, donc quorum **2f+1**, avec K=4/7/10 dans cette version. Le total N peut prendre n’importe quelle valeur compatible entre K et 64.

## Réglages et identités

1. Choisir le protocole.
2. Saisir **Nombre total de nœuds**.
3. Saisir **Nombre de mineurs**, **Nombre de validateurs** ou **Répliques PBFT votantes**.
4. Ouvrir Participants, ressources et pannes pour choisir les identités : la colonne Participe détermine leur rôle. Par défaut, le choix de K retient les identités les plus basses disponibles. Il peut être personnalisé.
5. Pour remplacer une identité lorsque le minimum est atteint, cocher la nouvelle avant de décocher l’ancienne. Appliquer & recommencer, puis lancer. Le bleu distingue les suiveurs, le vert les participants, le corail les contrôlés et le gris les nœuds hors ligne. Cliquer une copie affiche son rôle et son registre.

Changer le total conserve autant que possible le comité déjà choisi ; ajouter une machine ne lui donne donc pas automatiquement un rôle de consensus. Changer K ou les identités réévalue les poids du brouillon. Les ressources personnalisées hors comité sont zéro ; chaque membre PoW/PoS a une ressource strictement positive. En PBFT, une identité du comité vaut une voix, un suiveur zéro.

**Hors ligne et suiveur sont différents.** Un validateur hors ligne reste inscrit avec sa mise dans le dénominateur, mais ne vote pas. Un suiveur en ligne n’a aucune mise de consensus. En PoW, une panne supprime les découvertes du mineur concerné sans redistribuer sa puissance aux autres. La ligne « participants en ligne » distingue ces situations.

## Ce que font réellement les moteurs

PoW : seule une identité du comité à puissance positive reçoit des découvertes programmées. Les suiveurs reçoivent les blocs et vérifient le travail/certificat de découverte du modèle. Le calcul de nonce SHA-256 reste dans l’atelier Miner, qui ne modélise que sa course de mineurs.

PoS : seules les mises du comité sont positives ; la sélection ne peut tomber sur un suiveur. Un vote signé par un suiveur a un poids nul et est écarté. Les suiveurs vérifient les votes admissibles et les certificats, et constatent la finalité localement sans voter eux-mêmes.

PBFT : les leaders tournent uniquement parmi les identités du comité. PRE-PREPARE/PREPARE/COMMIT/VIEW_CHANGE/NEW_VIEW sont réservés à ces répliques. Les suiveurs peuvent soumettre/relayer des paiements et demander des blocs, mais n’envoient aucune de ces voix. Ils avancent lorsqu’un certificat COMMITTED valide est reçu et ses parents connus. Les signatures de suiveurs ne peuvent compléter un quorum ; un certificat contenant une identité non votante est refusé. Les exports et la vérification indépendante utilisent le même comité.

## Deux démonstrations importantes

Avec 10 nœuds, comité PBFT [N0,N1,N2,N3] : couper N4 à N9 laisse quatre votants ; les engagements continuent. Couper N0 et N1 laisse huit machines en ligne mais seulement deux votants : aucun quorum de trois. Le nombre total en ligne ne remplace pas le nombre de voix admissibles.

Avec le comité [N2,N4,N6,N8] et N2 leader silencieux : le prochain leader est N4, pas N3. La rotation suit le comité, pas toutes les machines du réseau.

## API, preuves et version

```json
{
  "protocol": "pbft",
  "nodeCount": 10,
  "consensusNodes": [0, 1, 2, 3]
}
```

consensusNodes contient les indices uniques des membres. Un champ absent ou une liste vide reste une notation de compatibilité : tous les nœuds, ou les nœuds à ressource positive si un tableau de ressources est fourni. La configuration normalisée et exportée contient toujours la liste explicite. Le champ participates des copies indique le rôle. Les contrôlés sont les premiers membres sélectionnés, pas des suiveurs choisis arbitrairement ; la part contrôlée porte uniquement sur les ressources du comité.

Modèle courant : atelier-fusion-4.1.0. L’empreinte du rapport couvre la liste du comité. Le résumé Solidity conserve le **nombre total** de nœuds ; la DApp affiche séparément le nombre de participants, protégé par l’empreinte complète. Le contrat V2 et MetaMask ne changent pas de rôle. Les anciens rapports 4.0 restent identifiés comme tels ; leurs anciennes mesures ne doivent pas être attribuées à une nouvelle configuration.

La comparaison standard utilise sept participants honnêtes sans suiveur, explicitement annoncés. Les séries et processus avancés ont leurs propres conditions affichées ; Distribuer ne lance que les répliques votantes, les suiveurs se configurant dans le laboratoire.

## Vérifier

Tests ciblés : tests/roles.test.ts. Après compilation : node --test build/tests/roles.test.js. Ils couvrent sélection non contiguë, absence de production/vote chez les suiveurs, conservation des registres, quorums, faux votes de suiveurs, pannes et rotation de leader.

Rapports reproductibles : node scripts/validate-roles.mjs, sortie artifacts/v4.1/. Les exemples montrent le même total de dix machines avec trois mineurs, trois validateurs ou quatre répliques PBFT.
