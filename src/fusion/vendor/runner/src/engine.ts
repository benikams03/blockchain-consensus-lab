// Banc d'intégration remplaçable par le moteur du lot 1 : aucun PoW/PBFT ni serveur ici.
type KeyObject = Uint8Array;
import type { Block, Certificate, Checkpoint, Effect, FaultEvidence, HeadVote, LinkVote, Ledger, LocalView, ModuleContext, ModuleInput, Observation, PosConfig, PosState, SignedMessage, Transaction } from '../../contracts/src/index.js';
import { PosAdapter, initialState, verifyCertificate, verifyFaultEvidence, verifyPosBlock, verifyTransactionEnvelope, linkIsLocallyVerifiable, FAULT_LABEL, MODEL_LABEL } from '../../consensus/pos/src/index.js';
import { collectMetrics } from './metrics.js';
import { EventQueue } from './eventQueue.js';
import { blockId, compareId, demoIdentity, freezeData, hash, makeBlock, makeDomain, signId, signMessage, txId, verifyId, verifyMessage } from '../../core/src/index.js';
import { checkpointKey, integer, isAncestor, proposerForSlot, totalStake, validateConfig } from '../../core/src/index.js';
import { applyTransactions, ledgerAt, selectTransactions } from '../../core/src/index.js';
import { defaultScenario, demoAccounts, demoPayment } from '../../scenarios/src/index.js';
import type { DemoScenario, DemoAccount } from '../../scenarios/src/index.js';
// État d'une machine virtuelle : ses connaissances sont distinctes de celles des autres machines.
export interface DemoNode {
    // Identifiant de cette machine, distinct des comptes de paiement.
    id: string;
    // Stockage local des blocs reçus et acceptés.
    blocks: Map<string, Block>;
    // Tête de la branche que cette machine retient actuellement.
    headId: string;
    // État de ses votes, dépendances et règles PoS.
    state: PosState;
    // Checkpoints justifiés vérifiés par le moteur hôte.
    justified: Map<string, Checkpoint>;
    // Checkpoint finalisé que cette machine ne doit pas remplacer par une branche incompatible.
    finalized: Checkpoint;
    // Sa copie des soldes et nonces des comptes utilisateurs.
    ledger: Ledger;
    // Paiements connus de cette machine, y compris ceux récupérés dans des blocs.
    transactions: Map<string, Transaction>;
}
// Journal pédagogique global : il n'est jamais transmis à la vue d'un validateur.
export interface VoteRecord {
    vote: HeadVote | LinkVote;
    signedAtMs: number;
    firstSentAtMs: number | null;
}
// Les injections de paiements et stratégies d'attaque appartiennent au banc, jamais à l'API du validateur honnête.
type EngineInput = ModuleInput | {
    kind: 'injectTransaction';
    transaction: Transaction;
} | {
    kind: 'strategySend';
    to: string;
    signed: SignedMessage;
};
// Une entrée planifiée possède un temps virtuel et un ordre pour départager deux événements simultanés.
interface Event {
    // Instant virtuel prévu pour traiter cette entrée.
    atMs: number;
    // Ordre d’insertion, utilisé en cas d’égalité de temps.
    seq: number;
    // Machine qui recevra l’entrée.
    nodeId: string;
    // Message, timer ou injection locale à traiter.
    input: EngineInput;
    // Instant de départ du transport, présent pour une livraison réseau.
    sentAtMs?: number;
}
// Refuse les champs inconnus, listes excessives et valeurs mal formées avant toute simulation.
function validateScenarioShape(s: DemoScenario): void {
    const allowed = new Set(['faultStartMs', 'silentNodes', 'invalidSigners', 'id', 'stakes', 'seed', 'maxSlots', 'slotsPerEpoch', 'minLatencyMs', 'maxLatencyMs', 'offline', 'equivocators', 'partitions',
        'nodeIds', 'selectionVersion', 'withholdVotes', 'doubleProposers', 'surroundVoters', 'observerNodeId', 'entryNodeId', 'transactionPlan', 'slotDurationMs', 'blockCapacity', 'accounts', 'stopAfterBlocks']);
    if (s.stopAfterBlocks !== undefined && !integer(s.stopAfterBlocks, 1, 100)) throw new Error('CONFIG_INVALID');
    if (s.accounts !== undefined && (!Array.isArray(s.accounts) || !integer(s.accounts.length, 1, 100)
        || new Set(s.accounts.map(account => account?.id)).size !== s.accounts.length
        || s.accounts.some(account => !account || Object.keys(account).some(key => !['id', 'name', 'initialBalance'].includes(key))
            || typeof account.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(account.id)
            || typeof account.name !== 'string' || account.name.length > 64 || !integer(account.initialBalance, 0, 1000000000)))) throw new Error('CONFIG_INVALID');
    if (!s || Object.keys(s).some(k => !allowed.has(k)) || !Array.isArray(s.stakes) || !integer(s.stakes.length, 1, 64)
        || s.stakes.some(n => !integer(n, 0, 1000000000)) || !integer(s.stakes.reduce((a, b) => a + b, 0), 1, 1000000000))
        throw new Error('CONFIG_INVALID');
    for (const list of [s.offline, s.equivocators, s.partitions])
        if (!Array.isArray(list) || list.length > 64)
            throw new Error('CONFIG_INVALID');
    if (s.faultStartMs !== undefined && !integer(s.faultStartMs)) throw new Error('CONFIG_INVALID');
    for (const list of [s.nodeIds, s.withholdVotes, s.doubleProposers, s.surroundVoters, s.silentNodes, s.invalidSigners]) {
        if (list !== undefined && (!Array.isArray(list) || list.length > 64 || list.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id))))
            throw new Error('CONFIG_INVALID');
    }
    for (const id of [s.observerNodeId, s.entryNodeId])
        if (id !== undefined && (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)))
            throw new Error('CONFIG_INVALID');
    if (s.transactionPlan !== undefined) {
        if (!Array.isArray(s.transactionPlan) || s.transactionPlan.length > 1000)
            throw new Error('CONFIG_INVALID');
        for (const p of s.transactionPlan) {
            if (!p || Object.keys(p).some(k => !['from', 'to', 'amount', 'nonce', 'atMs', 'entryNodeId'].includes(k))
                || ![p.from, p.to, p.entryNodeId].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id))
                || !integer(p.amount, 1) || !integer(p.nonce) || !integer(p.atMs))
                throw new Error('CONFIG_INVALID');
        }
    }
}
export class PosHarness {
    // Configuration figée de l’expérience, indépendante des connaissances locales de chaque machine.
    scenario: DemoScenario;
    // Liste publique des validateurs et des règles de temps, sélection et capacité.
    config: PosConfig;
    // Bloc initial commun à toutes les copies locales.
    genesis: Block;
    // Soldes initiaux des utilisateurs, sans lien avec les mises des validateurs.
    genesisLedger: Ledger;
    // Clés publiques des comptes de paiement, nécessaires pour vérifier leurs signatures.
    accountKeys: Map<string, string>;
    accounts: readonly DemoAccount[];
    windowEndMs: number;
    private targetReached = false;
    // Identité cryptographique du réseau simulé ; évite de mélanger les votes de deux configurations.
    domain: string;
    // Collection des machines virtuelles. Chaque valeur contient un état local indépendant.
    nodes = new Map<string, DemoNode>();
    // Journal destiné à l’interface et aux mesures ; il ne donne pas de connaissance supplémentaire aux nœuds.
    observations: Observation[] = [];
    // Archive publique des contenus signés, indexés par leur empreinte.
    messages = new Map<string, SignedMessage>();
    // Une entrée par vote signé, pas une entrée par destinataire ou retransmission.
    voteRecords = new Map<string, VoteRecord>();
    // Certificats de quorum vérifiés, référencés par les observations de finalité.
    certificates = new Map<string, Certificate>();
    // Preuves vérifiées de comportements contradictoires, dédupliquées par empreinte.
    evidence = new Map<string, FaultEvidence>();
    // Paiements programmés par le scénario ; cette liste globale n’est jamais donnée au module comme mempool.
    transactions: Transaction[] = [];
    // Horloge virtuelle du moteur, utilisée à la place de Date.now().
    nowMs = 0;
    // Les clés privées restent dans l'hôte : aucun module ne reçoit les clés d'un autre validateur.
    private keys = new Map<string, KeyObject>();
    private adapter = new PosAdapter();
    // File des actions futures : rien ne se produit chez un destinataire avant la livraison correspondante.
    private queue = new EventQueue<Event>();
    // Compteur qui impose un ordre stable aux événements simultanés.
    private sequence = 0;
    // Compteur du hasard de latence, séparé du tirage des proposants.
    private networkCounter = 0;
    // Empêche de programmer plusieurs fois les premiers timers.
    private started = false;
    // Interdit de redémarrer ou d’injecter un paiement après la fin de la fenêtre.
    private finished = false;
    // Évite de compter une retransmission comme un nouveau bloc produit.
    private announcedProposals = new Set<string>();
    // Conserve le certificat associé au dernier point finalisé pour documenter un éventuel conflit.
    private finalCertificateIds = new Map<string, string>();
    // Évite d’injecter plusieurs fois une même action malveillante programmée.
    private strategyInjections = new Set<string>();
    // Déduplication des observations locales, distincte des voix du consensus.
    private observedVotes = new Set<string>();
    // Prépare les identités, les comptes et le genesis ; le réseau n'a pas encore commencé à produire.
    constructor(scenario: DemoScenario = defaultScenario) {
        validateScenarioShape(scenario);
        if (typeof scenario.id !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(scenario.id))
            throw new Error('CONFIG_INVALID');
        this.scenario = freezeData(structuredClone(scenario));
        // Crée une machine pour chaque mise configurée ; nodeIds ne désigne jamais un compte qui paie.
        const validators = scenario.stakes.map((stake, i) => {
            const id = scenario.nodeIds?.[i] ?? (i < 26 ? String.fromCharCode(65 + i) : `node_${i}`), identity = demoIdentity(`node-${id}`);
            // Associe chaque clé de validateur à sa machine, indépendamment des clés des comptes David/Sarah/Léa.
            this.keys.set(id, identity.privateKey);
            return { id, stake, publicKey: identity.publicKey, hashPower: 0 };
        });
        this.config = { seed: scenario.seed, validators, slotDurationMs: scenario.slotDurationMs ?? 1000, slotsPerEpoch: scenario.slotsPerEpoch,
            maxSlots: scenario.maxSlots, blockCapacity: scenario.blockCapacity ?? 10, selectionVersion: scenario.selectionVersion ?? 'sha256-rejection-v1' };
        validateConfig(this.config);
        this.windowEndMs = this.config.maxSlots * this.config.slotDurationMs;
        if ((scenario.nodeIds && scenario.nodeIds.length !== scenario.stakes.length)
            || !Array.isArray(scenario.partitions) || scenario.partitions.some(p => !integer(p.startMs) || !integer(p.endMs, p.startMs + 1)
            || !Array.isArray(p.groups) || p.groups.some(g => g.some(id => !validators.some(n => n.id === id)))
            || new Set(p.groups.flat()).size !== p.groups.flat().length || p.groups.flat().length !== validators.length))
            throw new Error('CONFIG_INVALID');
        if (!integer(scenario.minLatencyMs, 0, 100000) || !integer(scenario.maxLatencyMs, scenario.minLatencyMs, 100000)
            || [...scenario.offline, ...scenario.equivocators, ...(scenario.withholdVotes ?? []), ...(scenario.doubleProposers ?? []), ...(scenario.surroundVoters ?? []), ...(scenario.silentNodes ?? []), ...(scenario.invalidSigners ?? []),
                ...(scenario.observerNodeId ? [scenario.observerNodeId] : []), ...(scenario.entryNodeId ? [scenario.entryNodeId] : [])]
                .some(id => !validators.some(n => n.id === id)))
            throw new Error('CONFIG_INVALID');
        freezeData(this.config);
        // Les clés de paiement sont créées séparément : Sarah peut recevoir sans faire tourner un validateur.
        this.accounts = freezeData(structuredClone(scenario.accounts ?? demoAccounts));
        this.accountKeys = new Map(this.accounts.map(account => [account.id, demoIdentity(`account-${account.id}`).publicKey]));
        // Distribue les fonds fictifs initiaux aux comptes utilisateurs ; ce ne sont pas les mises du consensus.
        this.genesisLedger = new Map(this.accounts.map(account => [account.id, { balance: account.initialBalance, nextNonce: 0 }]));
        // Genesis : point de départ commun de hauteur 0, sans paiement et sans proposant sélectionné.
        const header = { protocolVersion: 1 as const, protocol: 'pos' as const, parentId: null, height: 0, producerId: 'genesis',
            proposedAtMs: 0, txIds: [], consensus: { kind: 'pos' as const, slot: 0 } };
        this.genesis = { id: blockId(header), header, transactions: [], producerSignature: '' };
        freezeData(this.genesis);
        for (const account of this.genesisLedger.values())
            freezeData(account);
        const root = hash(['genesis-state-v1', [...this.genesisLedger].map(([id, a]) => [id, a.balance, a.nextNonce, this.accountKeys.get(id)])]);
        // Le domaine authentifie cette configuration et cet état initial pour refuser les votes d'un autre réseau simulé.
        this.domain = makeDomain(this.genesis.id, this.config, root);
        // Chaque machine reçoit son propre stockage de blocs, votes et paiements connus.
        for (const n of validators) {
            const cp = { epoch: 0, blockId: this.genesis.id };
            this.nodes.set(n.id, { id: n.id, blocks: new Map([[this.genesis.id, this.genesis]]), headId: this.genesis.id,
                state: initialState(this.genesis.id), justified: new Map([[checkpointKey(cp), cp]]), finalized: cp, ledger: this.genesisLedger, transactions: new Map() });
        }
    }
    // Construit la vue donnée au module : seulement ce que la machine indiquée connaît déjà.
    view(id: string): LocalView {
        const n = this.nodes.get(id)!;
        return { nodeId: id, nowMs: this.nowMs, config: this.config, domain: this.domain, genesisId: this.genesis.id,
            blocks: new Map(n.blocks), headId: n.headId, mempool: [...n.transactions.values()].filter(tx => tx.nonce >= (n.ledger.get(tx.from)?.nextNonce ?? 0)) };
    }
    // Fournit les services locaux de signature, vérification et construction, sans exposer de clé privée.
    context(id: string): ModuleContext {
        return {
            proposerForSlot: slot => proposerForSlot(this.config, slot), hash,
            sign: payload => freezeData(signMessage(this.domain, id, payload, this.keys.get(id)!)),
            verify: message => verifyMessage(message, this.config, this.domain),
            verifyTransaction: transaction => verifyTransactionEnvelope(transaction, this.accountKeys),
            verifyBlock: (block, known, nowMs) => this.verifyBlock(block, known, nowMs),
            buildBlock: (view, parentId, slot) => {
                const ledger = ledgerAt(parentId, view.blocks, this.genesisLedger, this.accountKeys);
                // Un proposant ne peut inclure que les paiements exécutables qu'il connaît dans son mempool.
                const txs = selectTransactions(ledger, view.mempool, this.config.blockCapacity, this.accountKeys);
                return this.block(id, parentId, slot, txs, view.blocks);
            }
        };
    }
    // Construit un bloc signé par la machine sélectionnée, en reliant sa hauteur à son parent local.
    block(producerId: string, parentId: string, slot: number, transactions: Transaction[] = [], known?: ReadonlyMap<string, Block>): Block {
        const parent = (known ?? this.nodes.get(producerId)!.blocks).get(parentId)!;
        return freezeData(makeBlock({ protocolVersion: 1, protocol: 'pos', parentId, height: parent.header.height + 1, producerId,
            proposedAtMs: slot * this.config.slotDurationMs, txIds: transactions.map(t => t.id), consensus: { kind: 'pos', slot } }, transactions, this.keys.get(producerId)!));
    }
    // Joue le rôle du portefeuille : signe un paiement avec la clé du compte émetteur, pas celle du nœud d'entrée.
    // from/to sont ici des comptes (david/sarah) ; dans send(from,to,...), ce sont au contraire des machines.
    transaction(from: string, to: string, amount: number, nonce: number): Transaction {
        if (!this.accountKeys.has(from) || !this.accountKeys.has(to)) throw new Error('ACCOUNT_UNKNOWN');
        const data = { from, to, amount, nonce }, id = txId(data);
        return { version: 1, ...data, id, signature: signId(id, demoIdentity(`account-${from}`).privateKey) };
    }
    // Programme l'arrivée du paiement à une seule machine ; les autres devront l'apprendre par le réseau.
    submitTransaction(tx: Transaction, entryNodeId: string, atMs = 0): void {
        if (this.finished)
            throw new Error('RUN_FINISHED');
        if (!this.nodes.has(entryNodeId) || !integer(atMs, this.nowMs, (this.config.maxSlots - 1) * this.config.slotDurationMs))
            throw new Error('TX_SCHEDULE_INVALID');
        const transaction = freezeData(structuredClone(tx));
        this.transactions.push(transaction);
        this.queue.push({ atMs, seq: ++this.sequence, nodeId: entryNodeId, input: { kind: 'injectTransaction', transaction } });
    }
    // Programme le paiement David → Sarah ; le nœud d'entrée est un paramètre indépendant de ces comptes.
    submitDemoTransaction(): Transaction {
        const tx = this.transaction(this.accounts[0].id, (this.accounts[1] ?? this.accounts[0]).id, demoPayment.amount, demoPayment.nonce);
        this.submitTransaction(tx, this.scenario.entryNodeId ?? this.config.validators[0].id, 0);
        return tx;
    }
    // Expose la vérification complète au module et aux tests, avec le registre initial de ce banc.
    verifyBlock(b: Block, known: ReadonlyMap<string, Block>, nowMs: number): boolean {
        return verifyPosBlock(b, known, this.config, this.genesisLedger, this.accountKeys, nowMs);
    }
    // Entrée locale utile aux tests ; en exécution intégrée, seul step() livre les messages.
    deliver(to: string, from: string, signed: SignedMessage): Effect[] {
        return this.input(to, { kind: 'message', message: { to, from, signed } });
    }
    // Livre une entrée au module local, conserve sa décision puis fait vérifier ses effets par l'hôte.
    private input(id: string, input: ModuleInput): Effect[] {
        if (this.nowMs >= (this.scenario.faultStartMs ?? 0) && this.scenario.silentNodes?.includes(id)) return [];
        const n = this.nodes.get(id)!;
        const pendingBefore = n.state.pending.size;
        if (input.kind === 'message' && !this.context(id).verify(input.message.signed)) {
            this.observe(id, 'MESSAGE_REJECTED_LOCAL', { messageId: input.message.signed.id, from: input.message.from, reason: 'Enveloppe, domaine ou signature invalide.' });
        }
        const decision = this.adapter.onInput(this.view(id), n.state, freezeData(structuredClone(input)), this.context(id));
        n.state = decision.nextProtocolState;
        this.applyEffects(id, decision.effects);
        if (n.state.pending.size !== pendingBefore) this.observe(id, 'PENDING_MESSAGES_CHANGED', { count: n.state.pending.size });
        return decision.effects;
    }
    // Ajoute une information pour l'affichage : cette observation n'est pas une preuve de consensus.
    private observe(nodeId: string | null, type: string, payload: Record<string, unknown>): void {
        this.observations.push({ schemaVersion: 1, runId: this.scenario.id, eventSeq: this.observations.length + 1,
            simTimeMs: this.nowMs, nodeId, type, payload });
    }
    private recordVote(nodeId: string, vote: HeadVote | LinkVote): void {
        // L'hôte authentifie l'auteur ; une annonce du module ne suffit pas à fabriquer un vote.
        if (vote.signerId !== nodeId || !this.context(nodeId).verify(vote)
            || (vote.payload.kind !== 'headVote' && vote.payload.kind !== 'linkVote')) throw new Error('EFFECT_INVALID_VOTE');
        if (this.voteRecords.has(vote.id)) return;
        const saved = freezeData(structuredClone(vote));
        this.voteRecords.set(saved.id, { vote: saved, signedAtMs: this.nowMs, firstSentAtMs: null });
        this.observe(nodeId, 'VOTE_SIGNED_LOCAL', { voteId: saved.id, voteType: saved.payload.kind });
    }
    // Vérifie si deux machines sont séparées par une partition à cet instant virtuel.
    private blocked(from: string, to: string, timeMs: number): boolean {
        return this.scenario.partitions.some(p => {
            if (timeMs < p.startMs || timeMs >= p.endMs)
                return false;
            return !p.groups.some(group => group.includes(from) && group.includes(to));
        });
    }
    // Tire le retard d'une livraison dans un flux séparé du calendrier des proposants.
    private latency(): number {
        const span = BigInt(this.scenario.maxLatencyMs - this.scenario.minLatencyMs + 1);
        const range = 1n << 256n, limit = range - range % span;
        let sample: bigint;
        do {
            sample = BigInt('0x' + hash(['network-rejection-v1', this.config.seed, this.networkCounter++]));
        } while (sample >= limit);
        return this.scenario.minLatencyMs + Number(sample % span);
    }
    // Programme un véritable message virtuel ; la réception immédiate n'est jamais supposée.
    private send(from: string, to: string, signed: SignedMessage, inject = true): void {
        if (this.nowMs >= (this.scenario.faultStartMs ?? 0) && (signed.payload.kind === 'headVote' || signed.payload.kind === 'linkVote') && this.scenario.withholdVotes?.includes(from))
            return;
        if ((signed.payload.kind === 'headVote' || signed.payload.kind === 'linkVote')
            && signed.signerId === from && this.context(from).verify(signed)) {
            // Inclut aussi les votes supplémentaires réellement signés par les acteurs malveillants.
            this.recordVote(from, signed as HeadVote | LinkVote);
            const record = this.voteRecords.get(signed.id)!;
            if (record.firstSentAtMs === null) {
                record.firstSentAtMs = this.nowMs;
                // Un envoi peut encore être perdu : ce marqueur ne prétend pas qu'un voisin l'a accepté.
                this.observe(from, 'VOTE_FIRST_SENT', { voteId: signed.id, voteType: signed.payload.kind });
            }
        }
        if (signed.payload.kind === 'proposal' && !this.announcedProposals.has(signed.payload.block.id)) {
            const b = signed.payload.block;
            this.announcedProposals.add(b.id);
            this.observe(from, 'BLOCK_PROPOSED', { blockId: b.id, parentId: b.header.parentId, height: b.header.height });
        }
        // Archive le contenu signé, puis attribue un identifiant distinct à chaque envoi réseau.
        if (this.nowMs >= (this.scenario.faultStartMs ?? 0) && this.scenario.invalidSigners?.includes(from)) signed = { ...signed, signature: btoa(String.fromCharCode(...new Uint8Array(64))) };
        this.messages.set(signed.id, signed);
        const id = `m-${++this.sequence}`;
        this.observe(from, 'MESSAGE_SENT', { messageId: id, from, to, messageType: signed.payload.kind, contentId: signed.id });
        if (this.blocked(from, to, this.nowMs) || this.scenario.offline.includes(to)) {
            this.observe(to, 'MESSAGE_DROPPED', { messageId: id, from, to, messageType: signed.payload.kind, reason: 'partition-or-offline' });
        }
        else {
            this.queue.push({ atMs: this.nowMs + this.latency(), seq: this.sequence, nodeId: to, sentAtMs: this.nowMs,
                input: { kind: 'message', message: { from, to, signed: structuredClone(signed) } } });
        }
        // Attaquant de scénario : il signe avec sa propre clé, sans modifier les observations des honnêtes.
        // Stratégie de double vote : l'acteur signe lui-même un second lien, que les pairs devront examiner.
        if (inject && this.nowMs >= (this.scenario.faultStartMs ?? 0) && signed.payload.kind === 'linkVote' && this.scenario.equivocators.includes(from)
            && signed.payload.target.blockId !== this.genesis.id) {
            const bad = this.context(from).sign({ kind: 'linkVote', source: { epoch: 0, blockId: this.genesis.id },
                target: { epoch: signed.payload.target.epoch, blockId: this.genesis.id } });
            this.send(from, to, bad, false);
        }
        // Stratégie de double proposition : crée un autre bloc signé du même acteur au même créneau.
        if (inject && this.nowMs >= (this.scenario.faultStartMs ?? 0) && signed.payload.kind === 'proposal' && this.scenario.doubleProposers?.includes(from)) {
            const original = signed.payload.block;
            const alternate = makeBlock({ ...original.header, proposedAtMs: original.header.proposedAtMs + 1 }, [...original.transactions], this.keys.get(from)!);
            const message = this.context(from).sign({ kind: 'proposal', block: alternate });
            this.queue.push({ atMs: this.nowMs + 1, seq: ++this.sequence, nodeId: from, input: { kind: 'strategySend', to, signed: message } });
        }
        // Stratégie de vote entourant : deux liens signés de coordonnées 0→3 et 1→2 sont envoyés.
        if (inject && this.nowMs >= (this.scenario.faultStartMs ?? 0) && signed.payload.kind === 'linkVote' && signed.payload.target.epoch === 3 && this.scenario.surroundVoters?.includes(from)) {
            const key = `surround:${from}:${to}`;
            if (!this.strategyInjections.has(key)) {
                this.strategyInjections.add(key);
                for (const [sourceEpoch, targetEpoch] of [[0, 3], [1, 2]]) {
                    this.send(from, to, this.context(from).sign({ kind: 'linkVote', source: { epoch: sourceEpoch, blockId: this.genesis.id },
                        target: { epoch: targetEpoch, blockId: this.genesis.id } }), false);
                }
            }
        }
    }
    private evidenceValid(e: FaultEvidence, id: string): boolean {
        return verifyFaultEvidence(e, this.view(id), this.context(id));
    }
    // L'hôte contrôle les effets : il ne doit pas faire confiance à une annonce non vérifiée du module.
    applyEffects(id: string, effects: Effect[]): void {
        const n = this.nodes.get(id)!;
        for (const e of effects) {
            switch (e.kind) {
                case 'observeVote': {
                    if (!this.context(id).verify(e.vote)) throw new Error('EFFECT_INVALID_VOTE');
                    const payload = e.vote.payload;
                    if (!this.config.validators.some(node => node.id === e.vote.signerId && node.stake > 0)
                        || (e.stage === 'head-applied' && (payload.kind !== 'headVote' || !n.blocks.has(payload.blockId) || payload.slot > Math.floor(this.nowMs / this.config.slotDurationMs)))
                        || (e.stage === 'link-verified' && (payload.kind !== 'linkVote' || !linkIsLocallyVerifiable(e.vote as LinkVote, this.view(id))
                            || payload.target.epoch > Math.floor(this.nowMs / (this.config.slotDurationMs * this.config.slotsPerEpoch))))) throw new Error('EFFECT_INVALID_VOTE');
                    const key = `${id}:${e.stage}:${e.vote.id}`;
                    if (!this.observedVotes.has(key)) {
                        this.observedVotes.add(key);
                        this.observe(id, e.stage === 'head-applied' ? 'HEAD_VOTE_APPLIED_LOCAL' : 'LINK_VOTE_VERIFIED_LOCAL', { voteId: e.vote.id, signerId: e.vote.signerId });
                    }
                    break;
                }
                case 'rejectBlock':
                    this.observe(id, 'BLOCK_REJECTED_LOCAL', { blockId: e.blockId, reason: e.reason });
                    break;
                case 'recordVote':
                    this.recordVote(id, e.vote);
                    break;
                // Ajoute un paiement signé au stockage local après une nouvelle vérification de l'hôte.
                case 'acceptTransaction':
                    if (!verifyTransactionEnvelope(e.transaction, this.accountKeys))
                        throw new Error('EFFECT_INVALID_TRANSACTION');
                    n.transactions.set(e.transaction.id, freezeData(structuredClone(e.transaction)));
                    this.observe(id, 'TX_ACCEPTED_LOCAL', { txId: e.transaction.id });
                    break;
                case 'send':
                    this.send(id, e.to, e.message);
                    break;
                // Programme une entrée future au lieu d'utiliser setTimeout ou l'horloge réelle.
                case 'armTimer':
                    if (!integer(e.atMs, this.nowMs) || !integer(e.generation, 1))
                        throw new Error('EFFECT_INVALID_TIMER');
                    this.queue.push({ atMs: e.atMs, seq: ++this.sequence, nodeId: id, input: { kind: 'timer', timerId: e.timerId, generation: e.generation } });
                    break;
                // Refait tous les contrôles du bloc avant de le rendre visible dans le stockage local.
                case 'acceptBlock':
                    if (!this.verifyBlock(e.block, n.blocks, this.nowMs))
                        throw new Error('EFFECT_INVALID_BLOCK');
                    n.blocks.set(e.block.id, freezeData(e.block));
                    for (const tx of e.block.transactions)
                        n.transactions.set(tx.id, tx);
                    this.observe(id, 'BLOCK_ACCEPTED_LOCAL', { blockId: e.block.id, parentId: e.block.header.parentId, height: e.block.header.height });
                    if (e.block.header.producerId === id && !this.announcedProposals.has(e.block.id)) {
                        this.announcedProposals.add(e.block.id);
                        this.observe(id, 'BLOCK_PROPOSED', { blockId: e.block.id, parentId: e.block.header.parentId, height: e.block.header.height });
                    }
                    break;
                // Un changement de branche reste descendant du préfixe déjà finalisé.
                case 'setHead': {
                    if (!n.blocks.has(e.blockId) || !isAncestor(n.blocks, n.finalized.blockId, e.blockId))
                        throw new Error('EFFECT_UNSAFE_HEAD');
                    // Recherche l'ancêtre commun pour distinguer une simple extension d'une réorganisation.
                    const oldHeadId = n.headId, oldAncestors = new Set<string>();
                    let b = n.blocks.get(oldHeadId)!;
                    for (;;) {
                        oldAncestors.add(b.id);
                        if (b.header.parentId === null)
                            break;
                        b = n.blocks.get(b.header.parentId)!;
                    }
                    const added: string[] = [];
                    b = n.blocks.get(e.blockId)!;
                    while (!oldAncestors.has(b.id)) {
                        added.push(b.id);
                        b = n.blocks.get(b.header.parentId!)!;
                    }
                    const commonAncestorId = b.id, removed: string[] = [];
                    b = n.blocks.get(oldHeadId)!;
                    while (b.id !== commonAncestorId) {
                        removed.push(b.id);
                        b = n.blocks.get(b.header.parentId!)!;
                    }
                    n.headId = e.blockId;
                    // Recalcule réellement les soldes : un paiement retiré de la branche ne reste pas crédité par erreur.
                    n.ledger = ledgerAt(n.headId, n.blocks, this.genesisLedger, this.accountKeys);
                    this.observe(id, 'HEAD_CHANGED', { oldHeadId, newHeadId: e.blockId, commonAncestorId, removedBlockIds: removed, addedBlockIds: added.reverse() });
                    break;
                }
                // Un certificat doit être revérifié par l'hôte avant toute mise à jour de justification ou de finalité.
                case 'justify':
                case 'finalize': {
                    const cert = e.certificate;
                    if (!verifyCertificate(cert, this.view(id), n.justified, this.context(id)))
                        throw new Error('EFFECT_INVALID_CERTIFICATE');
                    this.certificates.set(cert.id, cert);
                    if (e.kind === 'justify') {
                        n.justified.set(checkpointKey(cert.target), cert.target);
                        this.observe(id, 'CHECKPOINT_JUSTIFIED', { checkpoint: cert.target, certificateId: cert.id });
                    }
                    else {
                        if (cert.target.epoch !== cert.source.epoch + 1 || !isAncestor(n.blocks, n.finalized.blockId, cert.source.blockId)
                            || cert.source.epoch <= n.finalized.epoch)
                            throw new Error('EFFECT_UNSAFE_FINALITY');
                        // La source, et non la cible, est finalisée par ce lien consécutif ; le préfixe précédent doit être conservé.
                        n.finalized = cert.source;
                        this.finalCertificateIds.set(id, cert.id);
                        this.observe(id, 'CHECKPOINT_FINALIZED', { checkpoint: cert.source, certificateId: cert.id });
                    }
                    break;
                }
                // Archive une preuve vérifiée sans modifier les mises : aucune sanction économique n'est simulée.
                case 'reportFault':
                    if (!this.evidenceValid(e.evidence, id))
                        throw new Error('EFFECT_INVALID_EVIDENCE');
                    this.evidence.set(e.evidence.id, e.evidence);
                    this.observe(id, 'FAULT_EVIDENCE', { offenderId: e.evidence.offenderId, evidenceType: e.evidence.kind, evidenceId: e.evidence.id, label: FAULT_LABEL });
                    break;
                // Journalise une contradiction de finalité sans effacer l'ancien point finalisé.
                case 'safetyViolation':
                    if (!verifyCertificate(e.certificate, this.view(id), n.justified, this.context(id)))
                        throw new Error('EFFECT_INVALID_CERTIFICATE');
                    this.certificates.set(e.certificate.id, e.certificate);
                    this.observe(id, 'SAFETY_VIOLATION', { descriptionCode: 'CONFLICTING_FINALITY',
                        conflictingCertificateIds: [this.finalCertificateIds.get(id), e.certificate.id].filter(Boolean), preservedFinalized: n.finalized });
                    break;
            }
        }
    }
    // Initialise une fois les états des machines et leurs premiers timers.
    start(): void {
        if (this.started)
            return;
        this.started = true;
        for (const n of this.nodes.values()) {
            const decision = this.adapter.init(this.view(n.id), this.context(n.id));
            n.state = decision.nextProtocolState;
            this.applyEffects(n.id, decision.effects);
        }
    }
    // Traite une seule action : utile pour le futur bouton pas à pas de l'interface.
    step(): boolean {
        if (this.finished)
            return false;
        this.start();
        // Le temps décide d'abord ; la séquence d'insertion départage les événements au même instant.
        // La file fournit directement le minimum dans cet ordre, sans retrier tous les messages en vol.
        // La fenêtre de mesure est fixée avant l'expérience, même si des messages restent en vol à sa fin.
        const reference = this.nodes.get(this.scenario.observerNodeId ?? this.config.validators[0].id)!;
        if (!this.targetReached && this.scenario.stopAfterBlocks !== undefined && reference.blocks.get(reference.headId)!.header.height >= this.scenario.stopAfterBlocks) {
            // Termine le tour du dernier bloc pour permettre la propagation, sans lancer un nouveau tour de proposition.
            this.targetReached = true;
            this.windowEndMs = Math.min(this.windowEndMs, (Math.floor(this.nowMs / this.config.slotDurationMs) + 1) * this.config.slotDurationMs);
        }
        const endMs = this.windowEndMs;
        if (this.queue.length === 0 || this.queue.peek()!.atMs > endMs || (this.targetReached && this.queue.peek()!.atMs >= endMs)) {
            this.nowMs = endMs;
            this.finished = true;
            this.queue.clear();
            this.observe(null, 'RUN_STATUS_CHANGED', { status: 'finished', reason: this.targetReached ? 'BLOCK_TARGET_REACHED' : 'WINDOW_COMPLETE' });
            return false;
        }
        const event = this.queue.shift()!;
        this.nowMs = event.atMs;
        // À cet instant seulement, le paiement devient connu de sa machine d'entrée.
        if (event.input.kind === 'injectTransaction') {
            const tx = event.input.transaction;
            this.observe(null, 'TX_SUBMITTED', { txId: tx.id, entryNodeId: event.nodeId });
            if (this.scenario.offline.includes(event.nodeId) || !verifyTransactionEnvelope(tx, this.accountKeys)) {
                this.observe(event.nodeId, 'TX_REJECTED_LOCAL', { txId: tx.id, reason: 'ENTRY_OFFLINE_OR_INVALID_TRANSACTION', headId: this.nodes.get(event.nodeId)!.headId });
            }
            else {
                this.nodes.get(event.nodeId)!.transactions.set(tx.id, tx);
                this.observe(event.nodeId, 'TX_ACCEPTED_LOCAL', { txId: tx.id });
                this.input(event.nodeId, { kind: 'transactionAvailable', txId: tx.id });
            }
            return true;
        }
        // Une machine hors ligne ne produit pas et ne vote pas ; sa mise reste néanmoins dans le total configuré.
        if (this.scenario.offline.includes(event.nodeId))
            return true;
        if (event.input.kind === 'strategySend') {
            this.send(event.nodeId, event.input.to, event.input.signed, false);
            return true;
        }
        if (event.input.kind === 'message') {
            const m = event.input.message;
            if (this.blocked(m.from, m.to, this.nowMs)) {
                this.observe(m.to, 'MESSAGE_DROPPED', { messageId: `m-${event.seq}`, from: m.from, to: m.to, messageType: m.signed.payload.kind, reason: 'partition-at-delivery' });
                return true;
            }
            this.observe(event.nodeId, 'MESSAGE_DELIVERED', { messageId: `m-${event.seq}`, from: m.from, to: m.to, messageType: m.signed.payload.kind,
                contentId: m.signed.id, sentAtMs: event.sentAtMs, deliveredAtMs: this.nowMs });
        }
        this.input(event.nodeId, event.input);
        return true;
    }
    // Enchaîne les pas virtuels et arrête explicitement une expérience qui dépasserait le budget d'événements.
    run(): this {
        let count = 0;
        while (this.step()) {
            if (++count > 100000)
                throw new Error('EVENT_LIMIT_REACHED');
        }
        return this;
    }
    // Retourne une copie de tous les résultats publics, en sélectionnant les champs plutôt qu'en sérialisant l'hôte et ses secrets.
    export(): Record<string, unknown> {
        return structuredClone({ schemaVersion: 1, modelVersion: 'pos-guide-v2.2.0', modelLabel: MODEL_LABEL,
            randomVersion: this.config.selectionVersion, networkRandomVersion: 'sha256-rejection-v1', boundaryConvention: 'checkpoint before proposal; slot 0 starts at 0ms; ties by insertion sequence',
            scenario: this.scenario, config: this.config, accounts: this.accounts, domain: this.domain, genesis: this.genesis, blocks: [...new Map([...this.nodes.values()].flatMap(n => [...n.blocks])).values()], metrics: collectMetrics(this),
            genesisLedger: Object.fromEntries(this.genesisLedger), accountPublicKeys: Object.fromEntries(this.accountKeys),
            observations: this.observations, messages: [...this.messages.values()], transactions: this.transactions, voteRecords: [...this.voteRecords.values()], certificates: [...this.certificates.values()], evidence: [...this.evidence.values()],
            nodes: [...this.nodes.values()].map(n => ({ id: n.id, headId: n.headId, height: n.blocks.get(n.headId)!.header.height,
                finalized: n.finalized, justified: [...n.justified.values()], pendingMessages: n.state.pending.size, ledger: Object.fromEntries(n.ledger) })),
            totalConfiguredStake: totalStake(this.config.validators) });
    }
}
