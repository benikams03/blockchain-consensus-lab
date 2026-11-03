export type Protocol = 'pow' | 'pos' | 'pbft';
export type Attack = 'none' | 'majority' | 'double' | 'byzantine' | 'partition';
export interface Config {
    protocol: Protocol;
    seed: number;
    nodeCount: number;
    consensusNodes: number[];
    latencyMin: number;
    latencyMax: number;
    duration: number;
    blockInterval: number;
    slotDuration: number;
    epochLength: number;
    capacity: number;
    txInterval: number;
    confirmations: number;
    attack: Attack;
    attackerShare: number;
    faultyNodes: number;
    attackStart: number;
    releaseAt: number;
    accountCount: number;
    transactionCount: number;
    resources: number[];
    offlineNodes: number[];
    faultBehavior: 'default' | 'silent' | 'withhold' | 'equivocate' | 'surround' | 'invalid';
}
export interface Transaction {
    id: string;
    from: string;
    to: string;
    amount: number;
    nonce: number;
    signature: string;
}
export interface Account {
    balance: number;
    nonce: number;
}
export type Ledger = Record<string, Account>;
export interface Block {
    id: string;
    parent: string | null;
    height: number;
    producer: string;
    time: number;
    txs: Transaction[];
    protocol: Protocol;
    slot: number;
    work: number;
    signature: string;
}
export interface Message {
    id: string;
    from: string;
    to: string;
    type: string;
    body: any;
    sentAt: number;
    signature: string;
}
export interface Observation {
    seq: number;
    time: number;
    type: string;
    node: string | null;
    data: Record<string, any>;
}
export interface Checkpoint {
    epoch: number;
    block: string;
}
export interface LinkVote {
    source: Checkpoint;
    target: Checkpoint;
    validator: string;
    signature: string;
}
export interface PreparedCertificate {
    proposal: Message;
    prepares: Message[];
}
export interface CommitCertificate {
    block: Block;
    view: number;
    sequence: number;
    commits: Message[];
}
export interface ViewChange {
    view: number;
    sequence: number;
    head: string;
    prepared: PreparedCertificate | null;
}
export interface PBFTState {
    view: number;
    sequence: number;
    requestedView: number;
    proposals: Map<string, Message>;
    prepares: Map<string, Map<string, Message>>;
    commits: Map<string, Map<string, Message>>;
    sentPrepare: Set<string>;
    sentCommit: Set<string>;
    prepared: PreparedCertificate | null;
    changes: Map<number, Map<string, Message>>;
    sentChanges: Set<string>;
    sentNewViews: Set<string>;
    certificates: Map<string, CommitCertificate>;
    pending: CommitCertificate[];
    future: Message[];
}
export interface NodeState {
    id: string;
    index: number;
    faulty: boolean;
    power: number;
    stake: number;
    blocks: Map<string, Block>;
    ledgers: Map<string, Ledger>;
    mempool: Map<string, Transaction>;
    head: string;
    finalized: Checkpoint;
    justified: Checkpoint;
    justifiedSet: Map<string, Checkpoint>;
    pendingBlocks: Map<string, Block>;
    seen: Set<string>;
    timers: Map<string, number>;
    privateHead: string | null;
    privateBlocks: string[];
    privateTransactions: Map<string, Transaction>;
    released: boolean;
    headVotes: Map<string, {
        slot: number;
        block: string;
    }>;
    linkVotes: Map<string, Map<string, LinkVote>>;
    votedEpochs: Set<number>;
    votesHistory: Map<string, LinkVote[]>;
    pbft: PBFTState;
}
export interface ModuleContext {
    readonly config: Config;
    readonly now: number;
    readonly node: NodeState;
    readonly ids: string[];
    random(): number;
    after(name: string, delay: number, data?: any): void;
    send(to: string, type: string, body: any): void;
    broadcast(type: string, body: any): void;
    observe(type: string, data: Record<string, any>): void;
    propose(txs?: Transaction[], slot?: number, parent?: string): Block;
    accept(block: Block): boolean;
    adopt(block: string): boolean;
    select(parent?: string, exclude?: Set<string>): Transaction[];
    sign(data: any): string;
    verify(signer: string, data: any, signature: string): boolean;
    verifyMessage(message: Message): boolean;
    weight(id: string): number;
}
export interface ConsensusModule {
    init(ctx: ModuleContext): void;
    timer(ctx: ModuleContext, name: string, data: any): void;
    message(ctx: ModuleContext, message: Message): void;
}
export interface QueueEvent {
    time: number;
    order: number;
    kind: 'timer' | 'message' | 'tx' | 'start' | 'end';
    node?: string;
    data?: any;
}
export interface Metrics {
    observer: string;
    time: number;
    blocks: number;
    transactions: number;
    settledTransactions: number;
    tps: number;
    settledTps: number;
    messages: number;
    delivered: number;
    dropped: number;
    reorgs: number;
    maxReorg: number;
    finalizedHeight: number;
    confirmedHeight: number;
    medianInclusion: number | null;
    p95Inclusion: number | null;
    medianSettlement: number | null;
    unfinished: number;
    faults: number;
    heads: number;
    doubleSpend: 'not-attempted' | 'pending' | 'merchant-accepted' | 'success' | 'failed';
}
export interface Snapshot {
    schemaVersion: 1;
    modelVersion: string;
    config: Config;
    time: number;
    done: boolean;
    termination: 'duration' | 'event-limit' | null;
    nextSeq: number;
    metrics: Metrics;
    blocks: Block[];
    transactions: Transaction[];
    events: Observation[];
    nodes: {
        id: string;
        participates: boolean;
        faulty: boolean;
        power: number;
        stake: number;
        head: string;
        height: number;
        finalizedHeight: number;
        view: number;
        pending: number;
        ledger: Ledger;
    }[];
    merchant: {
        acceptedAt: number | null;
        payment: string | null;
        conflict: string | null;
    };
    inspection?: {
        model: string;
        votes: { id: string; validator: string; kind: string; slot: number; block: string; source?: string; sourceEpoch?: number; targetEpoch?: number; weight: number; signature: string; signedAt: number; sentAt: number | null; received: Record<string, number>; usedBy: string[] }[];
        certificates: { id: string; kind: string; block: string; source?: string; epoch?: number; sourceEpoch?: number; sequence?: number; view?: number; weight: number; total: number; signers: string[]; signatures: string[]; verifiedBy: string[] }[];
        evidence: { id: string; kind: string; offender: string; proof: unknown }[];
        accounts: { id: string; name: string; initialBalance: number }[];
        mining: { id: string; miner: string; block: string; time: number; work: number; private: boolean }[];
        knownBlocks: Record<string, string[]>;
        submitted: Record<string, number>;
    };
}
