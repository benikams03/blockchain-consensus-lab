# PoW courant et historique

index.ts ici est l’ancien moteur. **Fusion utilise src/fusion/vendor/consensus/pow et runner/src/powEngine.ts** via la façade Fusion.

Découverte exponentielle par mineur pondérée par puissance, travail cumulé des branches locales, ressource nulle et panne possibles. Branche privée de attackStart à releaseAt. Double dépense : livraison antérieure, paiement retiré, conflit confirmé. Le vrai calcul SHA-256 et Merkle se trouve dans src/advanced/pow-proof.ts, modèle séparé. Formules : docs/MODELE.md ; tests courants : tests/fusion.test.ts.
