# Exploration visuelle et choix final

Trois compositions originales sont consultables dans l'application et dans `designs.html`. Les données de cette galerie sont illustratives ; les données du laboratoire sont calculées par le moteur.

| Piste | Palette / composition | Atouts | Limites |
|---|---|---|---|
| Laboratoire botanique | Ivoire, vert profond, accents lime, titres éditoriaux | Graphes lisibles, captures imprimables, hiérarchie calme | Éviter les verts trop proches pour les états |
| Console orbitale | Nuit, cyan, trame technique, typographie monospace | Monitoring dense et identité technique | Moins lisible dans un rapport imprimé et plus fatigante pour la lecture théorique |
| Carnet pédagogique | Papier chaud, terracotta, annotations | Accueillant et narratif | Moins adapté à beaucoup d'événements simultanés |

## Direction retenue

Le laboratoire botanique est retenu : l'expérience reste au premier plan. Une navigation verticale sépare laboratoire, comparaison, scénarios, théorie et exploration visuelle. Le réseau central représente les connaissances et échanges ; le panneau latéral fixe la configuration.

Titres Georgia/serif, interface Segoe UI/sans-serif, données techniques monospace. Aucun téléchargement de police ni photographie décorative n’est nécessaire. React possède les SVG ; D3 fournit géométrie et échelles.

L’édition React enrichit la direction retenue : parcours choisir / observer / interpréter, neuf cartes numérotées filtrables, repères pédagogiques, mesures explicables au clic, bandeau d’observation calculé, tableau et diagramme horizontal. Les deux bornes de latence sont explicites et les réglages avancés se déplient à la demande.

Les conclusions comparent les compromis et les garanties. Les résultats gardent leurs conditions. Les cinq entrées de navigation restent accessibles sur mobile ; les dialogues natifs prennent en charge le focus et Échap.

La couleur ne porte pas seule la signification : libellés, numéros de blocs, légendes et journal donnent la même information. Les nœuds et blocs sont actionnables au clavier. Les animations tiennent compte de prefers-reduced-motion. Mise en page adaptée aux petits écrans.

## À vérifier visuellement

Lisibilité des quatre métriques, absence de débordements, distinction branche concurrente/retendue, largeur des tables, accès aux contrôles, présence des titres accessibles et cohérence des statuts locaux. Les captures de validation appartiennent au dossier artifacts si elles ont été produites.
