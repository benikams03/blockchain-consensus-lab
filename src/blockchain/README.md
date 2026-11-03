# Empreinte et garde Sepolia

anchor.ts exige un rapport Fusion terminé, non tronqué et cohérent entre configuration, métriques et snapshot. JSON à clés triées, sessionId de transport retiré et préfixe avant Keccak-256. Les arguments Solidity comptent genesis parmi les blocs.

requireSepolia lit le chainId, demande le changement puis revérifie. L’interface Blockchain signe via ethers/MetaMask et conserve les reçus confirmés. Lecture RPC sans signature. Aucune clé privée détenue.
