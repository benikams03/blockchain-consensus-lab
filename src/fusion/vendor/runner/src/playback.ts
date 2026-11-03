// Relecture fidèle des observations : la lecture, pause ou vitesse ne modifie jamais le consensus calculé.
import type { Block, Checkpoint, HeadVote, LinkVote, Ledger, Observation, SignedMessage, Transaction } from '../../contracts/src/index.js';
import type { PosHarness } from './engine.js';
import type { PowSimulation, SimulatedWorkProof } from './powEngine.js';
import type { PowMessage } from '../../contracts/src/pow.js';
import { cumulativeWork } from '../../consensus/pow/src/index.js';
import { isAncestor, ledgerAt } from '../../core/src/index.js';

interface NodeProjection {
    knownBlocks: Set<string>; knownTransactions: Set<string>; receivedVotes: Set<string>;
    latestHeadVotes: Map<string, string>; verifiedLinks: Set<string>; certificates: Set<string>; receivedVoteTimes: Map<string, number>;
    headId: string; finalized: Checkpoint; justified: Checkpoint; pending: number; ledger: Ledger;
}
export const teachingEvents = new Set(['TX_SUBMITTED', 'TX_REJECTED_LOCAL', 'BLOCK_PROPOSED', 'BLOCK_REJECTED_LOCAL',
    'MINING_DISCOVERY', 'PRIVATE_CHAIN_RELEASED', 'CHAIN_REORGANIZED', 'TX_CONFIRMED_LOCAL', 'TX_CONFIRMATION_REVOKED', 'MERCHANT_ACCEPTED', 'DOUBLE_SPEND_OBSERVED', 'VOTE_SIGNED_LOCAL', 'HEAD_VOTE_APPLIED_LOCAL', 'CHECKPOINT_JUSTIFIED', 'CHECKPOINT_FINALIZED', 'FAULT_EVIDENCE', 'SAFETY_VIOLATION', 'RUN_STATUS_CHANGED']);

export class SimulationPlayback {
    readonly blocks = new Map<string, Block>();
    readonly transactions = new Map<string, Transaction>();
    readonly messages = new Map<string, SignedMessage | PowMessage>();
    readonly protocol: 'pos' | 'pow';
    readonly proofs = new Map<string, SimulatedWorkProof>();
    readonly confirmationThreshold: number;
    readonly votes = new Map<string, HeadVote | LinkVote>();
    readonly certificates: PosHarness['certificates'];
    readonly evidence: PosHarness['evidence'];
    readonly events: Observation[];
    readonly config: PosHarness['config'] | PowSimulation['config'];
    readonly scenario: PosHarness['scenario'] | PowSimulation['scenario'];
    readonly accounts: PosHarness['accounts'];
    readonly durationMs: number;
    readonly exportData: Record<string, unknown>;
    readonly accountKeys: Map<string, string>;
    readonly genesisLedger: Ledger;
    readonly genesis: Block;
    cursor = 0;
    timeMs = 0;
    private nodes = new Map<string, NodeProjection>();
    private visibleBlocks = new Set<string>();
    private proposedBlocks = new Set<string>();
    private signedVotes = new Set<string>();
    private sentVotes = new Set<string>();
    private voteSignedTimes = new Map<string, number>();
    private voteSentTimes = new Map<string, number>();
    private submitted = new Set<string>();
    private firstInclusion = new Map<string, number>();
    private firstFinality = new Map<string, number>();

    constructor(run: PosHarness | PowSimulation) {
        if (!run.observations.some(event => event.type === 'RUN_STATUS_CHANGED' && event.payload.status === 'finished')) throw new Error('TRACE_NOT_FINISHED');
        this.protocol = 'proofs' in run ? 'pow' : 'pos';
        this.confirmationThreshold = 'confirmations' in run.config ? run.config.confirmations : 0;
        if ('proofs' in run) for (const [id, proof] of run.proofs) this.proofs.set(id, proof);
        this.config = run.config; this.scenario = run.scenario; this.accounts = run.accounts;
        this.events = run.observations; this.durationMs = run.windowEndMs; this.exportData = run.export();
        this.genesis = run.genesis; this.genesisLedger = run.genesisLedger; this.accountKeys = run.accountKeys;
        this.certificates = 'certificates' in run ? run.certificates : new Map(); this.evidence = 'evidence' in run ? run.evidence : new Map();
        // Le catalogue contient des données futures, mais seuls les identifiants révélés par les événements sont affichés.
        for (const message of run.messages.values()) {
            this.messages.set(message.id, message);
            if (message.payload.kind === 'proposal' || message.payload.kind === 'blockResponse') this.blocks.set(message.payload.block.id, message.payload.block);
            if (message.protocol === 'pos' && (message.payload.kind === 'headVote' || message.payload.kind === 'linkVote')) this.votes.set(message.id, message as HeadVote | LinkVote);
        }
        for (const node of run.nodes.values()) for (const [id, block] of node.blocks) this.blocks.set(id, block);
        if ('voteRecords' in run) for (const record of run.voteRecords.values()) this.votes.set(record.vote.id, record.vote);
        if ('catalog' in run) for (const [id, block] of run.catalog) this.blocks.set(id, block);
        for (const transaction of run.transactions) this.transactions.set(transaction.id, transaction);
        this.reset();
    }
    private reset(): void {
        this.cursor = 0; this.timeMs = 0; this.visibleBlocks = new Set([this.genesis.id]); this.proposedBlocks.clear();
        this.signedVotes.clear(); this.sentVotes.clear(); this.submitted.clear(); this.firstInclusion.clear(); this.firstFinality.clear();
        this.voteSignedTimes.clear(); this.voteSentTimes.clear();
        this.nodes = new Map(this.config.validators.map(node => [node.id, {
            knownBlocks: new Set([this.genesis.id]), knownTransactions: new Set<string>(), receivedVotes: new Set<string>(),
            latestHeadVotes: new Map<string, string>(), verifiedLinks: new Set<string>(), certificates: new Set<string>(), receivedVoteTimes: new Map<string, number>(),
            headId: this.genesis.id, finalized: { epoch: 0, blockId: this.genesis.id }, justified: { epoch: 0, blockId: this.genesis.id }, pending: 0, ledger: this.genesisLedger,
        }]));
    }
    private branch(headId: string): Block[] {
        const result: Block[] = [], seen = new Set<string>(); let block = this.blocks.get(headId);
        while (block && !seen.has(block.id)) { result.push(block); seen.add(block.id); block = block.header.parentId ? this.blocks.get(block.header.parentId) : undefined; }
        return result.reverse();
    }
    private apply(event: Observation): void {
        const node = event.nodeId ? this.nodes.get(event.nodeId) : undefined, p = event.payload;
        if (event.type === 'TX_SUBMITTED') this.submitted.add(String(p.txId));
        if (event.type === 'BLOCK_PROPOSED') { this.visibleBlocks.add(String(p.blockId)); this.proposedBlocks.add(String(p.blockId)); }
        if (event.type === 'VOTE_SIGNED_LOCAL') { this.signedVotes.add(String(p.voteId)); this.voteSignedTimes.set(String(p.voteId), event.simTimeMs); }
        if (event.type === 'VOTE_FIRST_SENT') { this.sentVotes.add(String(p.voteId)); this.voteSentTimes.set(String(p.voteId), event.simTimeMs); }
        if (!node) return;
        switch (event.type) {
            case 'TX_ACCEPTED_LOCAL': node.knownTransactions.add(String(p.txId)); break;
            case 'BLOCK_ACCEPTED_LOCAL': {
                const id = String(p.blockId); node.knownBlocks.add(id); this.visibleBlocks.add(id);
                for (const tx of this.blocks.get(id)?.transactions ?? []) node.knownTransactions.add(tx.id);
                break;
            }
            case 'MESSAGE_DELIVERED': {
                const message = this.messages.get(String(p.contentId));
                if (message?.protocol === 'pos' && (message.payload.kind === 'headVote' || message.payload.kind === 'linkVote')) {
                    node.receivedVotes.add(message.id);
                    if (!node.receivedVoteTimes.has(message.id)) node.receivedVoteTimes.set(message.id, event.simTimeMs);
                }
                break;
            }
            case 'HEAD_VOTE_APPLIED_LOCAL': node.latestHeadVotes.set(String(p.signerId), String(p.voteId)); break;
            case 'LINK_VOTE_VERIFIED_LOCAL': node.verifiedLinks.add(String(p.voteId)); break;
            case 'PENDING_MESSAGES_CHANGED': node.pending = Number(p.count); break;
            case 'HEAD_CHANGED': {
                node.headId = String(p.newHeadId);
                // Rejoue seulement une branche réellement choisie, pour restituer aussi les effets d'une réorganisation.
                node.ledger = ledgerAt(node.headId, this.blocks, this.genesisLedger, this.accountKeys);
                for (const block of this.branch(node.headId)) for (const tx of block.transactions) {
                    const key = `${event.nodeId}:${tx.id}`; if (!this.firstInclusion.has(key)) this.firstInclusion.set(key, event.simTimeMs);
                }
                break;
            }
            case 'CHECKPOINT_JUSTIFIED': {
                const point = p.checkpoint as unknown as Checkpoint;
                if (point.epoch > node.justified.epoch) node.justified = point;
                node.certificates.add(String(p.certificateId)); break;
            }
            case 'CHECKPOINT_FINALIZED': {
                node.finalized = p.checkpoint as unknown as Checkpoint; node.certificates.add(String(p.certificateId));
                for (const block of this.branch(node.finalized.blockId)) for (const tx of block.transactions) {
                    const key = `${event.nodeId}:${tx.id}`; if (!this.firstFinality.has(key)) this.firstFinality.set(key, event.simTimeMs);
                }
                break;
            }
        }
    }
    seekTime(timeMs: number): void {
        if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > this.durationMs) throw new Error('INVALID_TIME');
        if (timeMs === 0) { this.reset(); return; }
        if (timeMs < this.timeMs) this.reset();
        while (this.cursor < this.events.length && this.events[this.cursor].simTimeMs <= timeMs) this.apply(this.events[this.cursor++]);
        this.timeMs = timeMs;
    }
    step(mode: 'event' | 'meaningful' | 'block' = 'meaningful', scopeNodeId?: string): void {
        while (this.cursor < this.events.length) {
            const event = this.events[this.cursor++]; this.apply(event); this.timeMs = event.simTimeMs;
            if (mode === 'event' || (mode === 'block' && event.type === 'BLOCK_PROPOSED')
                || (mode === 'meaningful' && teachingEvents.has(event.type) && (!scopeNodeId || !event.nodeId || event.nodeId === scopeNodeId || event.type === 'BLOCK_PROPOSED'))) return;
        }
        this.timeMs = this.durationMs;
    }
    label(id: string): string {
        const block = this.blocks.get(id);
        if (!block || !this.visibleBlocks.has(id)) return `inconnu-${id.slice(0, 6)}`;
        const fork = [...this.visibleBlocks].some(other => other !== id && this.blocks.get(other)?.header.height === block.header.height);
        return `B${block.header.height}${fork ? '-' + id.slice(0, 6) : ''}`;
    }
    private accountName(id: string): string { return this.accounts.find(account => account.id === id)?.name ?? id; }
    describe(event: Observation): string {
        const p = event.payload, node = event.nodeId ?? 'Le simulateur';
        const vote = this.votes.get(String(p.voteId)), tx = this.transactions.get(String(p.txId));
        switch (event.type) {
            case 'TX_SUBMITTED': return tx ? `${this.accountName(tx.from)} envoie ${tx.amount} unités à ${this.accountName(tx.to)} via ${p.entryNodeId}.` : 'Un paiement arrive dans le réseau.';
            case 'TX_ACCEPTED_LOCAL': return `${node} conserve le paiement dans ses opérations en attente.`;
            case 'TX_REJECTED_LOCAL': return `${node} ne peut pas accepter le paiement : ${p.reason}.`;
            case 'MINING_DISCOVERY': return `${node} découvre un bloc par travail simulé${p.private ? ' et le conserve sur sa branche privée' : ''}.`;
            case 'PRIVATE_CHAIN_RELEASED': return `${node} publie ${p.count} bloc(s) de sa branche privée.`;
            case 'CHAIN_REORGANIZED': return `${node} remplace ${(p.removedBlockIds as string[]).length} bloc(s) par une branche de travail supérieur.`;
            case 'TX_CONFIRMED_LOCAL': return `${node} observe ${p.confirmations} confirmations pour ce paiement (seuil ${p.threshold}). Ce statut reste réversible.`;
            case 'TX_CONFIRMATION_REVOKED': return `${node} retire le statut confirmé de ce paiement après changement de branche.`;
            case 'MERCHANT_ACCEPTED': return `Le marchand fictif livre le bien après ${p.confirmations} confirmations chez ${node}.`;
            case 'DOUBLE_SPEND_OBSERVED': return `Après livraison du bien, ${node} suit une branche contenant le paiement concurrent : double dépense observée dans ce scénario.`;
            case 'BLOCK_PROPOSED': return `${node} propose ${this.label(String(p.blockId))}, avec ${this.blocks.get(String(p.blockId))?.transactions.length ?? 0} paiement(s).`;
            case 'BLOCK_ACCEPTED_LOCAL': return `${node} vérifie et conserve ${this.label(String(p.blockId))}.`;
            case 'BLOCK_REJECTED_LOCAL': return `${node} refuse ce bloc : ${p.reason}`;
            case 'VOTE_SIGNED_LOCAL': return vote?.payload.kind === 'headVote' ? `${node} signe son choix : continuer depuis ${this.label(vote.payload.blockId)}.`
                : vote?.payload.kind === 'linkVote' ? `${node} soutient le passage du repère ${vote.payload.source.epoch} au repère ${vote.payload.target.epoch}.` : `${node} signe un vote.`;
            case 'VOTE_FIRST_SENT': return `${node} envoie son vote aux autres machines.`;
            case 'HEAD_VOTE_APPLIED_LOCAL': return `${node} utilise maintenant le dernier avis de ${p.signerId} pour choisir sa chaîne.`;
            case 'LINK_VOTE_VERIFIED_LOCAL': return `${node} vérifie le vote de finalité de ${p.signerId}.`;
            case 'CHECKPOINT_JUSTIFIED': return `${node} réunit assez de poids pour accepter le repère ${(p.checkpoint as unknown as Checkpoint).epoch}.`;
            case 'CHECKPOINT_FINALIZED': return `${node} verrouille l'historique jusqu'à ${this.label((p.checkpoint as unknown as Checkpoint).blockId)}.`;
            case 'FAULT_EVIDENCE': return `${node} conserve une preuve de contradiction signée par ${p.offenderId}.`;
            case 'SAFETY_VIOLATION': return `${node} détecte un conflit de finalité et conserve son ancien historique verrouillé.`;
            case 'MESSAGE_REJECTED_LOCAL': return `${node} refuse un message mal authentifié.`;
            case 'HEAD_CHANGED': return `${node} choisit ${this.label(String(p.newHeadId))} comme dernier bloc.`;
            case 'MESSAGE_DELIVERED': return `${p.from} → ${p.to} : ${p.messageType} livré.`;
            case 'MESSAGE_DROPPED': return `${p.from} → ${p.to} : message perdu (${p.reason}).`;
            case 'RUN_STATUS_CHANGED': return p.reason === 'BLOCK_TARGET_REACHED' ? 'L’objectif de blocs est atteint ; la fenêtre de propagation est terminée.' : 'La fenêtre maximale est terminée.';
            default: return `${node} : ${event.type}.`;
        }
    }
    eventRows(nodeId?: string, all = false, limit = 100) {
        return this.events.slice(0, this.cursor).filter(event => (!nodeId || !event.nodeId || event.nodeId === nodeId)
            && (all || teachingEvents.has(event.type) || ['BLOCK_ACCEPTED_LOCAL', 'VOTE_FIRST_SENT', 'MESSAGE_REJECTED_LOCAL'].includes(event.type)))
            .slice(-limit).map(event => ({ ...event, description: this.describe(event) }));
    }
    transactionRows(nodeId: string) {
        const node = this.nodes.get(nodeId); if (!node) throw new Error('NODE_NOT_FOUND');
        const retained = this.branch(node.headId), finalIds = new Set(this.branch(node.finalized.blockId).flatMap(block => block.transactions.map(tx => tx.id)));
        return [...this.transactions.values()].map(tx => {
            const included = retained.find(block => block.transactions.some(value => value.id === tx.id));
            const known = node.knownTransactions.has(tx.id);
            const confirmations = included ? this.blocks.get(node.headId)!.header.height - included.header.height + 1 : 0;
            const status = !this.submitted.has(tx.id) ? 'programmée' : !known ? 'inconnue de ce nœud' : this.protocol === 'pos' && finalIds.has(tx.id) ? 'finalisée' : this.protocol === 'pow' && confirmations >= this.confirmationThreshold ? 'confirmée' : included ? 'incluse'
                : tx.nonce < (node.ledger.get(tx.from)?.nextNonce ?? 0) ? 'en conflit' : 'en attente';
            return { id: tx.id, from: this.accountName(tx.from), to: this.accountName(tx.to), amount: tx.amount, nonce: tx.nonce,
                status, confirmations: this.protocol === 'pow' ? confirmations : null, blockId: included?.id ?? null, block: included ? this.label(included.id) : null,
                firstInclusionMs: this.firstInclusion.get(`${nodeId}:${tx.id}`) ?? null, firstFinalityMs: this.firstFinality.get(`${nodeId}:${tx.id}`) ?? null };
        });
    }
    transactionDetails(id: string, nodeId: string) {
        const transaction = this.transactions.get(id); if (!transaction) return null;
        return { transaction, state: this.transactionRows(nodeId).find(row => row.id === id),
            publicKey: this.accountKeys.get(transaction.from),
            knownBy: [...this.nodes].filter(([, node]) => node.knownTransactions.has(id)).map(([nodeId]) => nodeId),
            includedInVisibleBlocks: [...this.visibleBlocks].filter(blockId => this.blocks.get(blockId)!.transactions.some(tx => tx.id === id)).map(blockId => ({ id: blockId, label: this.label(blockId) })) };
    }
    voteDetails(id: string, nodeId: string) {
        if (!this.signedVotes.has(id)) return null;
        const vote = this.votes.get(id)!, node = this.nodes.get(nodeId)!;
        return { vote, sent: this.sentVotes.has(id), received: node.receivedVotes.has(id),
            applied: node.latestHeadVotes.get(vote.signerId) === id || node.verifiedLinks.has(id) };
    }
    blockDetails(blockId: string, nodeId: string) {
        const node = this.nodes.get(nodeId), block = this.blocks.get(blockId);
        if (!node || !block || !this.visibleBlocks.has(blockId)) return null;
        const directVotes = [...this.signedVotes].map(id => this.votes.get(id)!).filter(vote => vote.payload.kind === 'headVote' && vote.payload.blockId === blockId)
            .map(vote => ({ id: vote.id, nodeId: vote.signerId, stake: this.config.validators.find(n => n.id === vote.signerId)!.stake,
                slot: vote.payload.kind === 'headVote' ? vote.payload.slot : 0, sent: this.sentVotes.has(vote.id), received: node.receivedVotes.has(vote.id),
                appliedAsLatest: node.latestHeadVotes.get(vote.signerId) === vote.id, signature: vote.signature }));
        const latestSupport = [...node.latestHeadVotes].map(([signerId, id]) => ({ signerId, vote: this.votes.get(id)! }))
            .filter(({ vote }) => vote?.payload.kind === 'headVote' && node.knownBlocks.has(blockId) && isAncestor(this.blocks, blockId, vote.payload.blockId))
            .map(({ signerId, vote }) => ({ nodeId: signerId, stake: this.config.validators.find(n => n.id === signerId)!.stake,
                viaBlock: vote.payload.kind === 'headVote' ? this.label(vote.payload.blockId) : '' }));
        const finalized = this.protocol === 'pos' && node.knownBlocks.has(blockId) && isAncestor(this.blocks, blockId, node.finalized.blockId);
        const retained = node.knownBlocks.has(blockId) && isAncestor(this.blocks, blockId, node.headId);
        const confirmations = retained ? this.blocks.get(node.headId)!.header.height - block.header.height + 1 : 0;
        return { block, label: this.label(blockId), knownLocally: node.knownBlocks.has(blockId), retained, finalized,
            confirmations: this.protocol === 'pow' ? confirmations : null,
            simulatedWorkProof: this.protocol === 'pow' && block.header.consensus.kind === 'pow' ? this.proofs.get(block.header.consensus.discoveryId) ?? null : null,
            directVotes, latestSupport, supportWeight: latestSupport.reduce((sum, vote) => sum + vote.stake, 0),
            transactionDetails: block.transactions.map(tx => ({ ...tx, fromName: this.accountName(tx.from), toName: this.accountName(tx.to) })) };
    }
    snapshot(nodeId = this.scenario.observerNodeId ?? this.config.validators[0].id) {
        const selected = this.nodes.get(nodeId); if (!selected) throw new Error('NODE_NOT_FOUND');
        const branch = new Set(this.branch(selected.headId).map(block => block.id)), final = new Set(this.branch(selected.finalized.blockId).map(block => block.id));
        const transactions = this.transactionRows(nodeId);
        const visibleBlocks = [...this.visibleBlocks].map(id => this.blocks.get(id)!).sort((a, b) => a.header.height - b.header.height || a.id.localeCompare(b.id));
        const visibleVotes = [...this.signedVotes].map(id => this.votes.get(id)!).map(vote => ({ id: vote.id, nodeId: vote.signerId,
            kind: vote.payload.kind, stake: this.config.validators.find(node => node.id === vote.signerId)!.stake,
            target: vote.payload.kind === 'headVote' ? this.label(vote.payload.blockId) : `R${vote.payload.source.epoch}/${this.label(vote.payload.source.blockId)} → R${vote.payload.target.epoch}/${this.label(vote.payload.target.blockId)}`,
            targetBlockId: vote.payload.kind === 'headVote' ? vote.payload.blockId : vote.payload.target.blockId,
            sent: this.sentVotes.has(vote.id), received: selected.receivedVotes.has(vote.id), applied: selected.latestHeadVotes.get(vote.signerId) === vote.id || selected.verifiedLinks.has(vote.id),
            signedAtMs: this.voteSignedTimes.get(vote.id) ?? null, sentAtMs: this.voteSentTimes.get(vote.id) ?? null,
            receivedAtMs: selected.receivedVoteTimes.get(vote.id) ?? null,
            inCertificate: [...selected.certificates].some(id => this.certificates.get(id)!.votes.some(member => member.id === vote.id)),
            slot: vote.payload.kind === 'headVote' ? vote.payload.slot : null, targetEpoch: vote.payload.kind === 'linkVote' ? vote.payload.target.epoch : null,
        }));
        const certificateRows = [...selected.certificates].map(id => {
            const cert = this.certificates.get(id)!; const signers = [...new Set(cert.votes.map(v => v.signerId))];
            return { id, source: `R${cert.source.epoch}/${this.label(cert.source.blockId)}`, target: `R${cert.target.epoch}/${this.label(cert.target.blockId)}`,
                weight: signers.reduce((sum, signer) => sum + this.config.validators.find(n => n.id === signer)!.stake, 0), signers };
        });
        return { protocol: this.protocol, confirmationThreshold: this.confirmationThreshold, cursor: this.cursor, totalEvents: this.events.length, timeMs: this.timeMs, durationMs: this.durationMs, done: this.cursor >= this.events.length,
            selectedNodeId: nodeId, config: { ...this.config, validators: this.config.validators.map(({ publicKey, ...node }) => node) },
            scenarioId: this.scenario.id, goalBlocks: this.scenario.stopAfterBlocks ?? null,
            summary: { chainBlocks: branch.size, proposedBlocks: this.proposedBlocks.size, signedVotes: this.signedVotes.size,
                sentVotes: this.sentVotes.size, plannedTransactions: transactions.length, includedTransactions: transactions.filter(tx => ['incluse', 'finalisée', 'confirmée'].includes(tx.status)).length,
                confirmedTransactions: transactions.filter(tx => tx.status === 'confirmée').length,
                cumulativeWork: this.protocol === 'pow' ? cumulativeWork(this.blocks, selected.headId) : null,
                reorganizations: this.events.slice(0, this.cursor).filter(e => e.type === 'CHAIN_REORGANIZED' && e.nodeId === nodeId).length,
                finalizedTransactions: transactions.filter(tx => tx.status === 'finalisée').length },
            nodes: this.config.validators.map(config => { const node = this.nodes.get(config.id)!; return { id: config.id, stake: config.stake,
                offline: this.scenario.offline.includes(config.id), hashPower: config.hashPower, discoveries: [...this.proposedBlocks].filter(id => this.blocks.get(id)!.header.producerId === config.id).length,
                cumulativeWork: this.protocol === 'pow' ? cumulativeWork(this.blocks, node.headId) : null,
                adversarial: 'powers' in this.scenario ? this.scenario.privateAttack?.minerId === config.id
                    : [...this.scenario.equivocators, ...(this.scenario.doubleProposers ?? []), ...(this.scenario.surroundVoters ?? []), ...(this.scenario.withholdVotes ?? [])].includes(config.id),
                head: this.label(node.headId), headId: node.headId, height: this.blocks.get(node.headId)!.header.height, knownBlocks: node.knownBlocks.size,
                finalizedEpoch: node.finalized.epoch, finalizedBlock: this.label(node.finalized.blockId), justifiedEpoch: node.justified.epoch,
                receivedVotes: node.receivedVotes.size, appliedHeads: node.latestHeadVotes.size, pending: node.pending }; }),
            blocks: visibleBlocks.map(block => ({ id: block.id, parentId: block.header.parentId, label: this.label(block.id), height: block.header.height,
                proposer: block.header.producerId, timeMs: block.header.proposedAtMs, transactionCount: block.transactions.length,
                knownLocally: selected.knownBlocks.has(block.id), retained: branch.has(block.id), finalized: this.protocol === 'pos' && final.has(block.id),
                confirmations: this.protocol === 'pow' && branch.has(block.id) ? this.blocks.get(selected.headId)!.header.height - block.header.height + 1 : 0,
                work: this.protocol === 'pow' ? cumulativeWork(this.blocks, block.id) : null,
                private: this.events.slice(0, this.cursor).some(e => e.type === 'BLOCK_PROPOSED' && e.payload.blockId === block.id && e.payload.private === true) })),
            accounts: this.accounts.map(account => ({ ...account, balance: selected.ledger.get(account.id)!.balance, nextNonce: selected.ledger.get(account.id)!.nextNonce })),
            merchant: this.events.slice(0, this.cursor).filter(e => ['MERCHANT_ACCEPTED', 'DOUBLE_SPEND_OBSERVED'].includes(e.type)).map(e => ({ ...e, description: this.describe(e) })),
            mining: this.protocol === 'pow' ? visibleBlocks.filter(b => b.header.height > 0).map(b => ({ blockId: b.id, label: this.label(b.id), miner: b.header.producerId, timeMs: b.header.proposedAtMs,
                discoveryId: b.header.consensus.kind === 'pow' ? b.header.consensus.discoveryId : '', work: cumulativeWork(this.blocks, b.id), knownLocally: selected.knownBlocks.has(b.id), retained: branch.has(b.id) })) : [],
            transactions, votes: visibleVotes, certificates: certificateRows, events: this.eventRows(nodeId, false, 60),
            recentNetwork: this.events.slice(Math.max(0, this.cursor - 800), this.cursor).filter(event => ['MESSAGE_SENT', 'MESSAGE_DELIVERED', 'MESSAGE_DROPPED'].includes(event.type) && event.simTimeMs >= this.timeMs - 350).slice(-48),
            faults: this.events.slice(0, this.cursor).filter(event => ['FAULT_EVIDENCE', 'SAFETY_VIOLATION'].includes(event.type)).map(event => ({ ...event, description: this.describe(event) })),
        };
    }
}
