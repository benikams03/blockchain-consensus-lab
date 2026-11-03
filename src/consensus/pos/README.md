# PoS courant et historique

index.ts ici conserve l’ancien moteur et sa correction d’ordre des checkpoints. **Fusion utilise src/fusion/vendor/consensus/pos et PosHarness**.

Mises fixes, sélection pondérée SHA-256 avec rejet, blocs/votes signés, LMD-GHOST et certificats de finalité. Quorum entier 3×poids >= 2×total déclaré, absents compris. Sources justifiées et checkpoints strictement avant leur frontière. Preuves de doubles propositions/votes et surround. Inspection : signé/envoyé/reçu/utilisé.

L’économie dépôt/retrait/sanctions appartient au StakingLab séparé ; aucun solde MetaMask ne détermine les votes. Export original vérifiable par src/fusion/verification.ts. Règles : docs/MODELE.md.
