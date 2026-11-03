# Sepolia et MetaMask — procédure de finition

## État de livraison

Solidity 0.8.28, optimiseur 200, EVM Paris. Contrat V2 compilé, tests Hardhat et Slither exécutés, ABI/bytecode inclus dans la DApp. Aucune adresse publique déclarée sans reçu. Votre MetaMask installé manque encore d’ETH de test.

## Préparer et déployer

1. Ouvrir l’URL publique dans le navigateur où MetaMask est installé, ou son navigateur mobile. Le navigateur intégré d’une autre application peut ne pas exposer l’extension.
2. Afficher les réseaux de test et choisir Sepolia, chaîne **11155111**. Copier uniquement l’adresse publique de votre compte de test.
3. Obtenir des ETH Sepolia auprès d’un faucet référencé sur https://ethereum.org/developers/docs/networks/#sepolia . Conditions variables : authentification ou preuve de travail possibles. Aucun ETH réel n’est nécessaire. Ne communiquer ni phrase ni clé privée.
4. Dans **Sepolia & preuves**, connecter MetaMask, contrôler compte/réseau/solde puis cliquer **Déployer avec MetaMask**. Lire l’estimation et signer personnellement. La DApp attend un reçu réussi ; refus, solde nul et échec ne sont pas annoncés comme succès.
5. Télécharger le reçu et conserver adresse, transactionHash, bloc et gasUsed. L’adresse est mémorisée seulement dans ce navigateur. Pour tous : compléter deployment/sepolia.json, reconstruire et republier ; les autres visiteurs peuvent aussi saisir l’adresse.

## Vérifier le source

Sur l’explorateur Sepolia, utiliser Solidity **Standard JSON Input** avec deployment/verification-input.json. Version exacte 0.8.28 (build affiché par solc), optimiseur 200, EVM Paris ; aucun argument constructeur. Le fichier contient source/paramètres publics. Après reconnaissance du source, passer verified à true dans deployment/sepolia.json et conserver le lien https://sepolia.etherscan.io/address/ADRESSE#code . Ne pas mettre true avant cette vérification.

## Ancrer puis vérifier un rapport

Terminer une expérience : done, terminaison duration. La capturer ou charger artifacts/v4/exemple-honest.json, exemple-resilience.json ou exemple-leader.json. Télécharger/conserver exactement le rapport. L’empreinte est Keccak-256 du préfixe `UNIKIN_CONSENSUS_FUSION_V4\n` puis JSON canonique complet à clés triées ; sessionId de transport retiré. Une simple réindentation ne change pas cette sérialisation. Les blocs du résumé Solidity incluent genesis, contrairement à la carte du laboratoire.

Lire le résumé, cliquer **Ancrer sur Sepolia**, signer personnellement et attendre le reçu confirmé. L’identifiant lie auteur/empreinte ; un même auteur ne peut réécrire sa déclaration. Garder reçu et lien de transaction.

Comme le professeur, sans portefeuille : charger le même rapport, saisir adresse du registre et adresse publique de l’auteur, garder un RPC Sepolia disponible et cliquer **Vérifier le fichier sur chaîne**. Empreinte et résumé sont comparés. Une modification de mesure invalide la correspondance ou les contrôles de cohérence. Consulter aussi l’événement sur l’explorateur.

L’ancrage prouve une correspondance avec une **déclaration d’auteur**, pas la vérité du calcul. Les certificats sont vérifiés séparément dans le laboratoire. Les identités simulées ne sont pas les comptes MetaMask.

Gas local : artifacts/contracts-gas.json ; unités de gas, pas coût ETH garanti. Le prix et l’estimation réelle se lisent dans MetaMask. Joindre rapport, reçus, contrat vérifié et URL DApp à la remise.
