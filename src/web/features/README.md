# Module recettes et interprétation

`scenarios.ts` décrit neuf recettes principales et sept explorations complètes avec question, objectif, configuration et trois observations. Chaque configuration est validée par le même validateur que les runs ordinaires. Une recette ne force aucun résultat.

`comparison.ts` définit Result et Finding, formate les valeurs et construit les conclusions à partir des mesures réellement obtenues. Il conserve les différences entre confirmation, finalité et engagement. Les cas d’usage sont conditionnés par les hypothèses du mécanisme ; ils ne sont pas prétendument prouvés par un débit isolé.

Les tests experience.test.ts (historique) et fusion.test.ts, puis scripts/validate-v4.mjs, vérifient les neuf recettes, les trois ajouts dans le moteur, les seuils PoS, les quorums PBFT et la gestion des mesures absentes ou partielles. Toute nouvelle recette doit conserver des paramètres complets et annoncer des observations vérifiables.
