// Proposition de contrats partagés : à harmoniser avec le dépôt du groupe.
// Empreinte sous forme de chaîne hexadécimale.
export type Hash = string;
// Identifiant d’une machine du réseau, pas d’un compte de paiement.
export type NodeId = string;
// Modes partagés avec les autres lots ; leurs implémentations ne figurent pas toutes dans ce paquet.
export type Protocol = 'pow' | 'pos' | 'pbft';
export interface Transaction {
    // Version du format du paiement.
    version: 1;
    // Empreinte du paiement : son contenu doit permettre de la recalculer.
    id: Hash;
    // Compte utilisateur qui envoie les unités, par exemple david ; ce champ ne désigne pas un nœud.
    from: string;
    // Compte utilisateur destinataire, par exemple sarah.
    to: string;
    // Nombre entier positif d’unités fictives à transférer.
    amount: number;
    // Numéro attendu pour le paiement de cet émetteur ; empêche une seconde exécution.
    nonce: number;
    // Signature du compte émetteur, vérifiable avec sa clé publique.
    signature: string;
}
export interface AccountState {
    // Solde du compte de paiement, indépendant des mises des validateurs.
    balance: number;
    // Numéro que devra porter son prochain paiement exécuté.
    nextNonce: number;
}
// Table des comptes de paiement et de leurs soldes/nonces, vue comme non modifiable par le consommateur.
export type Ledger = ReadonlyMap<string, AccountState>;
// Informations de consensus réservées à chaque mode ; la variante pos porte un numéro de créneau.
export type ConsensusHeader = {
    kind: 'pow';
    workUnits: 1;
    discoveryId: string;
} | {
    kind: 'pos';
    slot: number;
} | {
    kind: 'pbft';
    proposedInView: number;
    sequence: number;
};
export interface BlockHeader {
    // Version commune du format des blocs.
    protocolVersion: 1;
    // Mode de consensus : ce paquet exécute pos ; les autres modes sont réservés à leurs lots.
    protocol: Protocol;
    // Empreinte du bloc parent ; seul le genesis utilise null.
    parentId: Hash | null;
    // Position dans la branche : genesis = 0, puis parent.height + 1.
    height: number;
    // Machine validatrice qui propose le bloc, par exemple noeud-05.
    producerId: NodeId;
    // Instant virtuel de création, contrôlé par rapport au créneau.
    proposedAtMs: number;
    // Empreintes des paiements, dans le même ordre que le corps du bloc.
    txIds: Hash[];
    // Données propres au mode choisi ; pour PoS, numéro du créneau.
    consensus: ConsensusHeader;
}
export interface Block {
    // Empreinte recalculable de l’en-tête du bloc.
    id: Hash;
    // Informations qui relient le bloc à son parent et à son proposant.
    header: BlockHeader;
    // Paiements complets ; leurs signatures sont celles des comptes utilisateurs.
    transactions: Transaction[];
    // Signature du bloc par le validateur proposant, distincte des signatures des paiements.
    producerSignature: string;
}
export interface NodeConfig {
    // Identifiant d’une machine virtuelle : noeud-01, noeud-02, etc.
    id: NodeId;
    // Clé publique du validateur utilisée pour vérifier ses messages et blocs.
    publicKey: string;
    // Ressource prévue pour PoW ; vaut 0 dans ce modèle PoS.
    hashPower: number;
    // Mise fixe du validateur : poids de sélection et de vote, sans débit du solde de David ou Sarah.
    stake: number;
}
export interface Checkpoint {
    // Époque de référence ; une époque regroupe plusieurs créneaux.
    epoch: number;
    // Bloc associé à cette époque. Le couple époque/bloc identifie le checkpoint.
    blockId: Hash;
}
// Les messages PoS distinguent explicitement paiement relayé, bloc, vote de tête et vote de finalité.
export type PosPayload = {
    kind: 'transaction';
    transaction: Transaction;
} | {
    kind: 'proposal';
    block: Block;
} | {
    kind: 'headVote';
    slot: number;
    blockId: Hash;
} | {
    kind: 'linkVote';
    source: Checkpoint;
    target: Checkpoint;
} | {
    kind: 'requestBlock';
    blockId: Hash;
} | {
    kind: 'blockResponse';
    block: Block;
};
export interface SignedMessage<P extends PosPayload = PosPayload> {
    // Version du format réseau.
    protocolVersion: 1;
    // Les enveloppes de ce module sont exclusivement PoS.
    protocol: 'pos';
    // Empreinte qui identifie le réseau simulé et sa configuration publique.
    domain: Hash;
    // Identifiant du nœud qui signe l’enveloppe réseau.
    signerId: NodeId;
    // Contenu : paiement relayé, proposition, vote ou demande de bloc.
    payload: P;
    // Empreinte canonique de cette enveloppe avant signature.
    id: Hash;
    // Signature du nœud signataire ; un paiement relayé garde en plus la signature de son compte émetteur.
    signature: string;
}
// Avis signé sur une tête de branche, distinct d’un vote source-cible de finalité.
export type HeadVote = SignedMessage<Extract<PosPayload, {
    kind: 'headVote';
}>>;
// Vote signé entre deux checkpoints d’époque.
export type LinkVote = SignedMessage<Extract<PosPayload, {
    kind: 'linkVote';
}>>;
export interface Certificate {
    // Empreinte déterministe du lien et des votes qui constituent cette preuve.
    id: Hash;
    // Checkpoint déjà justifié à partir duquel les validateurs votent.
    source: Checkpoint;
    // Checkpoint d’époque plus récente que le certificat peut justifier.
    target: Checkpoint;
    // Votes signés concordants ; chaque identité contribue une seule fois au poids.
    votes: LinkVote[];
}
// Deux objets authentiques contradictoires : une preuve de comportement fautif, sans sanction économique automatique.
export type FaultEvidence = {
    id: Hash;
    kind: 'DOUBLE_VOTE' | 'SURROUND_VOTE';
    offenderId: NodeId;
    first: LinkVote;
    second: LinkVote;
} | {
    id: Hash;
    kind: 'DOUBLE_PROPOSAL';
    offenderId: NodeId;
    first: Block;
    second: Block;
};
export interface PosConfig {
    // Seed publique du tirage reproductible ; ne contient aucune clé privée.
    seed: string;
    // Durée virtuelle d’un créneau de proposition.
    slotDurationMs: number;
    // Nombre de créneaux dans une époque de finalité.
    slotsPerEpoch: number;
    // Nombre de créneaux de l’expérience, même si certains ne produisent aucun bloc.
    maxSlots: number;
    // Nombre maximal de paiements par bloc.
    blockCapacity: number;
    // Machines autorisées à participer, avec leurs clés publiques et mises fixes.
    validators: NodeConfig[];
    // Version explicite du générateur de sélection ; elle fait partie des conditions de rejeu.
    selectionVersion: 'park-miller-v1' | 'sha256-rejection-v1';
}
export interface LocalView {
    // Machine qui reçoit cette vue ; elle ne voit pas le stockage des autres.
    nodeId: NodeId;
    // Temps virtuel actuel fourni par le moteur.
    nowMs: number;
    // Paramètres publics communs aux nœuds.
    config: Readonly<PosConfig>;
    // Domaine accepté pour les messages de cette exécution.
    domain: Hash;
    // Identifiant du point de départ commun de la chaîne.
    genesisId: Hash;
    // Seulement les blocs déjà connus de cette machine.
    blocks: ReadonlyMap<Hash, Block>;
    // Bloc actuellement choisi comme tête de sa branche.
    headId: Hash;
    // Paiements connus localement, candidats à un prochain bloc.
    mempool: readonly Transaction[];
}
export interface ModuleContext {
    // Service public qui calcule quel validateur est autorisé à proposer à ce créneau.
    proposerForSlot(slot: number): NodeId;
    // Signe un contenu avec la clé du nœud local ; la clé privée n’est pas exposée au module.
    sign<P extends PosPayload>(payload: P): SignedMessage<P>;
    // Vérifie le format, le domaine et la signature d’un message réseau.
    verify(message: SignedMessage): boolean;
    // Vérifie le format et la signature du compte qui a émis le paiement.
    verifyTransaction(transaction: Transaction): boolean;
    // Vérifie le bloc et ses paiements avec les blocs disponibles localement.
    verifyBlock(block: Block, knownBlocks: ReadonlyMap<Hash, Block>, nowMs: number): boolean;
    // Construit une proposition sur un parent local avec les paiements exécutables du mempool.
    buildBlock(view: LocalView, parentId: Hash, slot: number): Block;
    // Calcule une empreinte commune pour les certificats et preuves.
    hash(value: readonly unknown[]): Hash;
}
// Une entrée devient visible à un nœud seulement après livraison par l’hôte.
export type ModuleInput = {
    kind: 'message';
    message: {
        from: NodeId;
        to: NodeId;
        signed: SignedMessage;
    };
} | {
    kind: 'timer';
    timerId: string;
    generation: number;
} | {
    kind: 'transactionAvailable';
    txId: Hash;
};
// Une demande du module au moteur ; l’hôte vérifie les blocs, certificats et preuves avant de l’appliquer.
export type Effect = {
    // Distingue un avis réellement appliqué localement d'un message seulement reçu.
    kind: 'observeVote';
    vote: HeadVote | LinkVote;
    stage: 'head-applied' | 'link-verified';
} | {
    kind: 'rejectBlock';
    blockId: Hash;
    reason: string;
} | {
    // Trace un vote réellement signé localement ; cela ne signifie ni envoi ni prise en compte par un voisin.
    kind: 'recordVote';
    vote: HeadVote | LinkVote;
} | {
    kind: 'acceptTransaction';
    transaction: Transaction;
} | {
    kind: 'send';
    to: NodeId;
    message: SignedMessage;
} | {
    kind: 'armTimer';
    timerId: string;
    atMs: number;
    generation: number;
} | {
    kind: 'acceptBlock';
    block: Block;
} | {
    kind: 'setHead';
    blockId: Hash;
} | {
    kind: 'justify';
    certificate: Certificate;
} | {
    kind: 'finalize';
    certificate: Certificate;
} | {
    kind: 'reportFault';
    evidence: FaultEvidence;
} | {
    kind: 'safetyViolation';
    certificate: Certificate;
    finalized: Checkpoint;
};
export interface Decision<S, E = Effect> {
    // Nouvel état local du consensus, sans modification cachée de l’ancien.
    nextProtocolState: S;
    // Actions demandées au moteur hôte, à appliquer dans leur ordre après vérification.
    effects: E[];
}
export interface ConsensusAdapter<S, V = LocalView, I = ModuleInput, C = ModuleContext, E = Effect> {
    // Initialise l’état d’un nœud et ses premiers timers virtuels.
    init(view: V, context: C): Decision<S, E>;
    // Traite une seule entrée locale : message livré, timer ou nouveau paiement connu.
    onInput(view: V, state: Readonly<S>, input: I, context: C): Decision<S, E>;
}
export interface Observation {
    // Version du format d’affichage.
    schemaVersion: 1;
    // Identifiant de l’expérience ; le serveur collectif ajoutera un identifiant de session si nécessaire.
    runId: string;
    // Ordre croissant des observations dans l’expérience.
    eventSeq: number;
    // Instant simulé ; ne correspond pas à la durée d’exécution de ton PC.
    simTimeMs: number;
    // Nom de ce qui s’est produit, par exemple HEAD_CHANGED ou CHECKPOINT_FINALIZED.
    type: string;
    // Machine concernée ; null pour un fait global de l’expérience.
    nodeId: NodeId | null;
    // Détails publics utiles à l’interface, sans clé privée.
    payload: Record<string, unknown>;
}
export interface PosState {
    // Paiements déjà relayés afin d’éviter une diffusion infinie entre voisins.
    knownTransactionIds: Set<Hash>;
    // Dernière demande par pair/bloc, en temps virtuel : empêche une tempête de requêtes sur une dépendance absente.
    blockRequestAt: Map<string, number>;
    // Prochain créneau que ce nœud doit traiter.
    nextSlot: number;
    // Dernier créneau pour lequel il a déjà émis son avis de tête.
    lastHeadVotedSlot: number;
    // Dernier vote de tête par validateur : une identité ne compte pas plusieurs fois.
    latestHeadVotes: Map<NodeId, HeadVote>;
    // Historique signé des liens source-cible, nécessaire aux certificats et preuves de faute.
    linkVotes: Map<Hash, LinkVote>;
    // Messages en attente de blocs manquants ; ce n’est pas le nombre de paiements dans le mempool.
    pending: Map<Hash, {
        from: NodeId;
        signed: SignedMessage;
    }>;
    // Première proposition connue par proposant et créneau, pour détecter une seconde proposition.
    proposals: Map<string, Block>;
    // Checkpoints dont les preuves de justification sont vérifiées localement.
    justified: Map<string, Checkpoint>;
    // Point dont le passé doit être préservé lors des futurs choix de branche.
    finalized: Checkpoint;
    // Certificats déjà traités, pour ne pas appliquer deux fois le même effet.
    handledCertificates: Set<Hash>;
    // Preuves de faute déjà signalées, pour dédupliquer les retransmissions.
    reportedEvidence: Set<Hash>;
}

// Données de démonstration communes aux scénarios, indépendantes du consensus.
export interface PaymentAccount { id: string; name: string; initialBalance: number }
export interface PlannedPayment { from: string; to: string; amount: number; nonce: number; atMs: number; entryNodeId: string }
export interface NetworkPartition { startMs: number; endMs: number; groups: string[][] }
