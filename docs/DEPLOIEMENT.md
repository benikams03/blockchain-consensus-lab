# Déploiement — Fusion 4

## Interface

npm ci, npm run contracts:compile, npm run build produisent dist/. Vercel : utiliser vercel.json et dist, vérifier les chemins des Workers sur la même origine. MetaMask doit être installé dans le navigateur qui ouvre l’URL.

L’URL Sites du README donne une version publique consultable ; ce n’est pas un déploiement Vercel ni un moteur Render/Railway. Le mode navigateur fonctionne sans API.

## API et WebSocket

render.yaml et railway.json sont fournis. Installer/construire puis npm start ; HOST=0.0.0.0, PORT du fournisseur, ALLOWED_ORIGINS avec origine exacte de l’interface sans chemin. Santé : /api/health.

Dans l’interface, ouvrir Moteur navigateur, saisir l’origine HTTPS et connecter. Vérifier création, pas, pause, reconnexion et export ; WSS est fourni derrière le proxy HTTPS. Une session sans stockage persistant disparaît au redémarrage. Une offre gratuite peut se mettre en veille.

Les processus PBFT locaux ne sont pas activés automatiquement en public : plusieurs ports/PID et ressources réelles, à réserver au poste de démonstration ou à une infrastructure dédiée.

## Contrat et dépôt

Suivre SEPOLIA.md. Après reçu réel : renseigner deployment/sepolia.json, reconstruire et republier. L’empreinte de build inclut ce fichier pour éviter une ancienne configuration en cache.

Créer le dépôt GitHub sous le compte du groupe et importer les sources avec package-lock.json et .gitignore ; renseigner auteurs et URL. Exclure node_modules, .local, identités privées et secrets. Les dépendances se reconstruisent avec npm ci.

Avant remise : ouvrir l’URL sans compte ChatGPT, exécuter une expérience, vérifier un rapport ancré et garder les vrais liens du contrat, du dépôt et des hébergements demandés.
