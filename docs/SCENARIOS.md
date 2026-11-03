# Scénarios — Fusion 4

Neuf étapes principales et sept explorations supplémentaires. Choisir la carte applique tous ses paramètres, remet l’horloge à zéro et laisse l’expérience en pause. Les fichiers TypeScript sont la source des réglages ; le JSON mesuré en conserve une copie complète.

| ID | Protocole | Nœuds | Réglage distinctif |
|---|---|---|---|
| honest | POW | 7 | seed 42, latence 120–700 ms, attaque none, comportement default |
| forks | POW | 7 | seed 17, latence 700–2800 ms, attaque none, comportement default |
| double | POW | 7 | seed 7, latence 120–700 ms, attaque double, comportement default |
| finality | POS | 7 | seed 42, latence 120–700 ms, attaque byzantine, comportement default |
| leader | PBFT | 4 | seed 42, latence 120–700 ms, attaque byzantine, comportement default |
| partition | PBFT | 4 | seed 42, latence 120–700 ms, attaque partition, comportement default |
| majority | POW | 7 | seed 7, latence 120–700 ms, attaque majority, comportement default |
| resilience | POS | 7 | seed 42, latence 120–700 ms, attaque byzantine, comportement default |
| rotation | PBFT | 7 | seed 42, latence 120–700 ms, attaque byzantine, comportement default |
| zero-power | POW | 3 | seed 42, latence 120–700 ms, attaque none, comportement default, ressources [80, 20, 0] |
| zero-stake | POS | 3 | seed 42, latence 120–700 ms, attaque none, comportement default, ressources [80, 20, 0] |
| offline-stake | POS | 4 | seed 42, latence 120–700 ms, attaque none, comportement default, ressources [40, 20, 20, 20], hors ligne [0] |
| retained-votes | POS | 7 | seed 42, latence 120–700 ms, attaque byzantine, comportement withhold |
| surround-vote | POS | 7 | seed 42, latence 120–700 ms, attaque byzantine, comportement surround |
| pbft-equivocation | PBFT | 4 | seed 42, latence 120–700 ms, attaque byzantine, comportement equivocate |
| pbft-invalid | PBFT | 4 | seed 42, latence 120–700 ms, attaque byzantine, comportement invalid |

La carte explique la question et trois observations attendues. Le moteur mesure le résultat ; réussite d’une attaque ou progression ne sont jamais garanties pour toutes les seeds. Pour le récit détaillé et les heures actualisées de la double dépense, lire SOUTENANCE.md.
