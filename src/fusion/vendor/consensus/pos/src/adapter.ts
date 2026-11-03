import type { Block, Certificate, Checkpoint, ConsensusAdapter, Decision, Effect, FaultEvidence, HeadVote, LinkVote, LocalView, ModuleContext, ModuleInput, PosState, SignedMessage } from '../../../contracts/src/index.js';
import { checkpointKey, hasSupermajority, integer, isAncestor, sameCheckpoint, totalStake, validCheckpoint, compareId } from '../../../core/src/index.js';
export const MODEL_LABEL = 'PoS pédagogique inspiré de Gasper';
export const FAULT_LABEL = 'Preuve de faute détectée ; sanctions économiques non exécutées';
// Chaque nœud démarre avec le genesis justifié et finalisé, sans connaître de vote des autres.
export function initialState(genesisId: string): PosState {
    const genesis = { epoch: 0, blockId: genesisId };
    return { knownTransactionIds: new Set(), blockRequestAt: new Map(), nextSlot: 0, lastHeadVotedSlot: -1, latestHeadVotes: new Map(), linkVotes: new Map(),
        pending: new Map(), proposals: new Map(), justified: new Map([[checkpointKey(genesis), genesis]]),
        finalized: genesis, handledCertificates: new Set(), reportedEvidence: new Set() };
}
// Copie les collections avant une transition pour préserver l'ancien état et permettre des tests reproductibles.
function copyState(s: Readonly<PosState>): PosState {
    return { ...s, knownTransactionIds: new Set(s.knownTransactionIds), blockRequestAt: new Map(s.blockRequestAt), latestHeadVotes: new Map(s.latestHeadVotes), linkVotes: new Map(s.linkVotes),
        pending: new Map(s.pending), proposals: new Map(s.proposals), justified: new Map(s.justified),
        handledCertificates: new Set(s.handledCertificates), reportedEvidence: new Set(s.reportedEvidence) };
}
// Un vote source-cible ne contribue que si ses blocs sont connus et appartiennent à une même branche.
export function linkIsLocallyVerifiable(v: LinkVote, view: LocalView): boolean {
    const { source: s, target: t } = v.payload;
    return s.epoch < t.epoch && validCheckpoint(s, view.blocks, view.genesisId, view.config.slotsPerEpoch)
        && validCheckpoint(t, view.blocks, view.genesisId, view.config.slotsPerEpoch)
        && isAncestor(view.blocks, s.blockId, t.blockId);
}
// Identifie un ensemble de votes concordants sans dépendre de leur ordre de réception.
export function certificateId(source: Checkpoint, target: Checkpoint, votes: LinkVote[], ctx: Pick<ModuleContext, 'hash'>): string {
    return ctx.hash(['pos-certificate', 1, source.epoch, source.blockId, target.epoch, target.blockId,
        votes.map(v => v.id).sort(compareId)]);
}
// Le moteur doit refaire cette vérification avant toute modification visible de finalité.
// Un certificat est une preuve de quorum, pas une simple annonce envoyée par un nœud.
export function verifyCertificate(cert: Certificate, view: LocalView, justified: ReadonlyMap<string, Checkpoint>, ctx: ModuleContext): boolean {
    try {
        if (!validCheckpoint(cert.source, view.blocks, view.genesisId, view.config.slotsPerEpoch)
            || !validCheckpoint(cert.target, view.blocks, view.genesisId, view.config.slotsPerEpoch)
            || cert.source.epoch >= cert.target.epoch
            || !justified.has(checkpointKey(cert.source)) || cert.votes.length === 0
            || cert.target.epoch > Math.floor(view.nowMs / (view.config.slotDurationMs * view.config.slotsPerEpoch))
            || cert.id !== certificateId(cert.source, cert.target, cert.votes, ctx))
            return false;
        // Ce registre de signataires empêche de compter plusieurs fois une même identité dans le quorum.
        const ids = new Set<string>();
        let weight = 0;
        for (const vote of cert.votes) {
            if (vote.payload.kind !== 'linkVote' || !ctx.verify(vote) || ids.has(vote.signerId)
                || !sameCheckpoint(vote.payload.source, cert.source) || !sameCheckpoint(vote.payload.target, cert.target)
                || !linkIsLocallyVerifiable(vote, view))
                return false;
            const node = view.config.validators.find(n => n.id === vote.signerId);
            if (!node || node.stake === 0)
                return false;
            ids.add(vote.signerId);
            // On additionne les mises des signataires distincts, pas le nombre de messages reçus.
            weight += node.stake;
        }
        return hasSupermajority(weight, totalStake(view.config.validators));
    }
    catch {
        return false;
    }
}
// LMD-GHOST pédagogique : dernier vote connu de chaque identité, une seule contribution.
// Le choix de branche suit le sous-arbre le plus soutenu par les derniers votes connus localement.
export function chooseHead(view: LocalView, state: Readonly<PosState>): string {
    // Le point de départ doit être justifié et compatible avec le préfixe déjà finalisé.
    const anchors = [...state.justified.values()]
        .filter(c => isAncestor(view.blocks, state.finalized.blockId, c.blockId))
        .sort((a, b) => b.epoch - a.epoch || compareId(a.blockId, b.blockId));
    let head = anchors[0]?.blockId ?? state.finalized.blockId;
    // Reconstruit les bifurcations à partir des seuls blocs connus de ce nœud.
    const children = new Map<string, Block[]>();
    for (const b of view.blocks.values()) {
        if (b.header.parentId === null)
            continue;
        const list = children.get(b.header.parentId) ?? [];
        list.push(b);
        children.set(b.header.parentId, list);
    }
    // Chaque validateur apporte au plus sa mise : seul son dernier vote de tête est conservé.
    const weight = (b: Block): number => {
        let w = 0;
        for (const n of view.config.validators) {
            const vote = state.latestHeadVotes.get(n.id);
            if (vote && isAncestor(view.blocks, b.id, vote.payload.blockId))
                w += n.stake;
        }
        return w;
    };
    for (;;) {
        const candidates = children.get(head);
        if (!candidates?.length)
            return head;
        // À poids égal, l'identifiant de bloc départage les branches pour éviter une décision aléatoire cachée.
        candidates.sort((a, b) => weight(b) - weight(a) || compareId(a.id, b.id));
        head = candidates[0].id;
    }
}
// À la frontière d'une époque, recherche le dernier bloc local produit avant cette frontière.
export function checkpointAtBoundary(view: LocalView, headId: string, epoch: number): Checkpoint {
    const boundary = epoch * view.config.slotsPerEpoch;
    let b = view.blocks.get(headId);
    while (b && b.header.height > 0 && b.header.consensus.kind === 'pos' && b.header.consensus.slot >= boundary) {
        b = b.header.parentId === null ? undefined : view.blocks.get(b.header.parentId);
    }
    return { epoch, blockId: b?.id ?? view.genesisId };
}
// Abréviations dans les transitions : view = vue locale ; s = état copié ; ctx = services locaux de l’hôte.
// effects contient les actions à faire vérifier et exécuter par le moteur, sans modifier les voisins directement.
export class PosAdapter implements ConsensusAdapter<PosState> {
    // L'initialisation programme le premier créneau à 0 ms dans l'horloge virtuelle du moteur.
    init(view: LocalView, _ctx: ModuleContext): Decision<PosState> {
        return { nextProtocolState: initialState(view.genesisId), effects: [
                { kind: 'armTimer', timerId: 'slot:0', atMs: 0, generation: 1 }
            ] };
    }
    // Une transition reçoit un événement local et renvoie un nouvel état plus des effets à exécuter par l'hôte.
    onInput(originalView: LocalView, old: Readonly<PosState>, input: ModuleInput, ctx: ModuleContext): Decision<PosState> {
        const s = copyState(old), effects: Effect[] = [];
        // Cette copie inclura les nouveaux blocs acceptés pendant la transition, sans lire le stockage des voisins.
        const blocks = new Map(originalView.blocks);
        let view: LocalView = { ...originalView, blocks };
        // Convertit le temps virtuel en créneau ; une époque regroupe plusieurs créneaux.
        const currentSlot = Math.floor(view.nowMs / view.config.slotDurationMs);
        const currentEpoch = Math.floor(currentSlot / view.config.slotsPerEpoch);
        const stake = (id: string) => view.config.validators.find(n => n.id === id)?.stake ?? 0;
        const requested = new Set<string>();
        // La diffusion est une liste d'envois dirigés : chaque destinataire subit son propre retard réseau.
        const broadcast = (m: SignedMessage) => {
            for (const n of [...view.config.validators].sort((a, b) => compareId(a.id, b.id))) {
                if (n.id !== view.nodeId)
                    effects.push({ kind: 'send', to: n.id, message: m });
            }
        };
        // Conserve une preuve signée une seule fois, même si ses messages sont retransmis.
        const report = (e: Omit<Extract<FaultEvidence, {
            kind: 'DOUBLE_PROPOSAL';
        }>, 'id'> | Omit<Extract<FaultEvidence, {
            kind: 'DOUBLE_VOTE' | 'SURROUND_VOTE';
        }>, 'id'>) => {
            const ids = [e.first.id, e.second.id].sort(compareId);
            const id = ctx.hash(['pos-fault', 1, e.kind, e.offenderId, ...ids]);
            if (!s.reportedEvidence.has(id)) {
                s.reportedEvidence.add(id);
                effects.push({ kind: 'reportFault', evidence: { ...e, id } as FaultEvidence });
            }
        };
        // Demande un bloc absent au pair qui l'a mentionné ; aucune lecture globale ne remplace ce message.
        const request = (id: string, from: string) => {
            const key = `${from}:${id}`;
            if (blocks.has(id) || requested.has(key) || from === view.nodeId)
                return;
            // Réexaminer un message en attente ne doit pas déclencher une nouvelle requête à chaque livraison.
            // Après un créneau, une nouvelle tentative reste possible si la demande ou sa réponse a été perdue.
            const last = s.blockRequestAt.get(key);
            if (last !== undefined && view.nowMs - last < view.config.slotDurationMs) return;
            s.blockRequestAt.set(key, view.nowMs);
            requested.add(key);
            effects.push({ kind: 'send', to: from, message: ctx.sign({ kind: 'requestBlock', blockId: id }) });
        };
        // Conserve l'historique des liens pour repérer des contradictions du même validateur.
        const addLink = (v: LinkVote) => {
            for (const other of s.linkVotes.values()) {
                if (other.signerId !== v.signerId || other.id === v.id)
                    continue;
                const a = other.payload, b = v.payload;
                if (a.target.epoch === b.target.epoch)
                    report({ kind: 'DOUBLE_VOTE', offenderId: v.signerId, first: other, second: v });
                if ((a.source.epoch < b.source.epoch && b.target.epoch < a.target.epoch)
                    || (b.source.epoch < a.source.epoch && a.target.epoch < b.target.epoch)) {
                    report({ kind: 'SURROUND_VOTE', offenderId: v.signerId, first: other, second: v });
                }
            }
            s.linkVotes.set(v.id, v);
        };
        // Traite un message après authentification, en distinguant paiement, bloc et deux familles de votes.
        const receive = (m: SignedMessage, from: string): void => {
            if (!view.config.validators.some(n => n.id === from) || !ctx.verify(m))
                return;
            const p = m.payload;
            // Un paiement doit être signé par son compte utilisateur ; le nœud qui le relaie n'en devient pas l'émetteur.
            if (p.kind === 'transaction') {
                if (!ctx.verifyTransaction(p.transaction) || s.knownTransactionIds.has(p.transaction.id))
                    return;
                s.knownTransactionIds.add(p.transaction.id);
                effects.push({ kind: 'acceptTransaction', transaction: p.transaction });
                broadcast(ctx.sign({ kind: 'transaction', transaction: p.transaction }));
                return;
            }
            // Répond uniquement si le bloc demandé appartient déjà au stockage local.
            if (p.kind === 'requestBlock') {
                const b = blocks.get(p.blockId);
                if (b && b.header.height > 0)
                    effects.push({ kind: 'send', to: from, message: ctx.sign({ kind: 'blockResponse', block: b }) });
                return;
            }
            // Une proposition est nouvelle ; une réponse de bloc peut réparer une dépendance manquante.
            if (p.kind === 'proposal' || p.kind === 'blockResponse') {
                const b = p.block;
                if (!b?.header || b.header.protocol !== 'pos' || b.header.consensus.kind !== 'pos'
                    || !integer(b.header.consensus.slot) || b.header.consensus.slot > currentSlot
                    || (p.kind === 'proposal' && m.signerId !== b.header.producerId))
                    return;
                if (blocks.has(b.id)) {
                    s.pending.delete(m.id);
                    return;
                }
                if (b.header.parentId !== null && !blocks.has(b.header.parentId)) {
                    s.pending.set(m.id, { from, signed: m });
                    request(b.header.parentId, from);
                    return;
                }
                s.pending.delete(m.id);
                if (!ctx.verifyBlock(b, blocks, view.nowMs)) {
                    effects.push({ kind: 'rejectBlock', blockId: b.id, reason: 'Bloc invalide : proposant, signature, parent, temps ou paiements non conformes.' });
                    return;
                }
                const key = `${b.header.producerId}:${b.header.consensus.slot}`;
                // Recherche une autre proposition du même acteur au même créneau afin de produire une preuve si elles diffèrent.
                const previous = s.proposals.get(key);
                if (previous && previous.id !== b.id)
                    report({ kind: 'DOUBLE_PROPOSAL', offenderId: b.header.producerId, first: previous, second: b });
                if (!previous)
                    s.proposals.set(key, b);
                blocks.set(b.id, b);
                effects.push({ kind: 'acceptBlock', block: b });
                return;
            }
            if (stake(m.signerId) === 0)
                return;
            // Un vote de tête indique la branche préférée ; il ne finalise pas automatiquement son bloc.
            if (p.kind === 'headVote') {
                if (!integer(p.slot) || p.slot > currentSlot)
                    return;
                const block = blocks.get(p.blockId);
                if (!block) {
                    s.pending.set(m.id, { from, signed: m });
                    request(p.blockId, from);
                    return;
                }
                s.pending.delete(m.id);
                if (block.header.height > 0 && block.header.consensus.kind === 'pos' && block.header.consensus.slot > p.slot)
                    return;
                const previous = s.latestHeadVotes.get(m.signerId);
                if (!previous || p.slot > previous.payload.slot || (p.slot === previous.payload.slot && compareId(m.id, previous.id) < 0)) {
                    // Remplace le dernier vote de cette identité au lieu d'ajouter une nouvelle voix.
                    s.latestHeadVotes.set(m.signerId, m as HeadVote);
                    effects.push({ kind: 'observeVote', vote: m as HeadVote, stage: 'head-applied' });
                }
                return;
            }
            // Le vote de lien sert aux checkpoints d'époque et aux certificats de justification/finalisation.
            if (p.kind === 'linkVote') {
                if (!integer(p.source?.epoch) || !integer(p.target?.epoch) || p.source.epoch >= p.target.epoch
                    || p.target.epoch > currentEpoch || typeof p.source.blockId !== 'string' || typeof p.target.blockId !== 'string')
                    return;
                addLink(m as LinkVote);
                if (!blocks.has(p.source.blockId) || !blocks.has(p.target.blockId)) {
                    s.pending.set(m.id, { from, signed: m });
                    request(p.source.blockId, from);
                    request(p.target.blockId, from);
                }
                else {
                    s.pending.delete(m.id);
                    if (linkIsLocallyVerifiable(m as LinkVote, view)) effects.push({ kind: 'observeVote', vote: m as LinkVote, stage: 'link-verified' });
                }
            }
        };
        // Regroupe les liens identiques et réévalue les certificats quand leurs dépendances deviennent vérifiables.
        const updateProofs = (): void => {
            const groups = new Map<string, Map<string, LinkVote>>();
            for (const v of s.linkVotes.values()) {
                if (!linkIsLocallyVerifiable(v, view))
                    continue;
                const key = `${checkpointKey(v.payload.source)}>${checkpointKey(v.payload.target)}`;
                const group = groups.get(key) ?? new Map<string, LinkVote>();
                // Une identité n'occupe qu'une entrée dans ce groupe, même si son vote a été reçu plusieurs fois.
                group.set(v.signerId, v);
                groups.set(key, group);
            }
            let changed = true;
            while (changed) {
                changed = false;
                for (const key of [...groups.keys()].sort(compareId)) {
                    const votes = [...groups.get(key)!.values()].sort((a, b) => compareId(a.signerId, b.signerId));
                    const { source, target } = votes[0].payload;
                    // Identité de la preuve indépendante de l'ordre d'arrivée des votes.
                    const certificate: Certificate = { id: certificateId(source, target, votes, ctx), source, target, votes };
                    if (s.handledCertificates.has(certificate.id) || !verifyCertificate(certificate, view, s.justified, ctx))
                        continue;
                    s.handledCertificates.add(certificate.id);
                    if (!s.justified.has(checkpointKey(target))) {
                        // Le quorum justifie la cible ; cette étape seule ne la finalise pas.
                        s.justified.set(checkpointKey(target), target);
                        changed = true;
                        effects.push({ kind: 'justify', certificate });
                    }
                    // Seul un lien entre époques consécutives permet ici de finaliser sa source.
                    if (target.epoch !== source.epoch + 1)
                        continue;
                    if (!isAncestor(blocks, s.finalized.blockId, source.blockId)
                        && !isAncestor(blocks, source.blockId, s.finalized.blockId)) {
                        effects.push({ kind: 'safetyViolation', certificate, finalized: s.finalized });
                    }
                    else if (source.epoch > s.finalized.epoch && isAncestor(blocks, s.finalized.blockId, source.blockId)) {
                        // Avance la finalité uniquement sur un descendant du point déjà finalisé.
                        s.finalized = source;
                        effects.push({ kind: 'finalize', certificate });
                    }
                }
            }
        };
        // Réessaie les messages en attente, met à jour les preuves puis recalcule la tête locale.
        const settle = () => {
            // Réessayer les références devenues locales, sans catalogue global.
            let changed = true;
            while (changed) {
                const size = blocks.size, waiting = s.pending.size;
                for (const p of [...s.pending.values()])
                    receive(p.signed, p.from);
                changed = size !== blocks.size || waiting !== s.pending.size;
            }
            updateProofs();
            view = { ...view, headId: chooseHead(view, s) };
        };
        // Le moteur signale qu'un paiement vient d'arriver dans le mempool de ce seul nœud.
        if (input.kind === 'transactionAvailable') {
            const tx = view.mempool.find(t => t.id === input.txId);
            if (tx && ctx.verifyTransaction(tx) && !s.knownTransactionIds.has(tx.id)) {
                s.knownTransactionIds.add(tx.id);
                broadcast(ctx.sign({ kind: 'transaction', transaction: tx }));
            }
        }
        else if (input.kind === 'message') {
            if (input.message.to === view.nodeId)
                receive(input.message.signed, input.message.from);
            settle();
        }
        // Les timers utilisent le temps simulé ; une ancienne génération ne doit pas déclencher de nouveau vote.
        else if (input.kind === 'timer' && input.generation === 1) {
            const [kind, raw] = input.timerId.split(':');
            const slot = Number(raw);
            if (!/^\d+$/.test(raw ?? '') || !integer(slot) || slot >= view.config.maxSlots)
                return { nextProtocolState: s, effects };
            if (kind === 'slot' && slot === s.nextSlot && view.nowMs === slot * view.config.slotDurationMs) {
                s.nextSlot += 1;
                settle();
                const epoch = Math.floor(slot / view.config.slotsPerEpoch);
                if (slot > 0 && slot % view.config.slotsPerEpoch === 0 && stake(view.nodeId) > 0) {
                    // Le checkpoint est choisi avant la proposition du nouveau créneau, conformément à notre convention.
                    const target = checkpointAtBoundary(view, view.headId, epoch);
                    const source = [...s.justified.values()]
                        .filter(c => c.epoch < epoch && isAncestor(blocks, c.blockId, target.blockId)
                        && isAncestor(blocks, s.finalized.blockId, c.blockId))
                        .sort((a, b) => b.epoch - a.epoch || compareId(a.blockId, b.blockId))[0];
                    if (source) {
                        const vote = ctx.sign({ kind: 'linkVote', source, target });
                        // Conserve la signature locale même si le scénario empêche ensuite son envoi.
                        effects.push({ kind: 'recordVote', vote });
                        receive(vote, view.nodeId);
                        broadcast(vote);
                    }
                }
                // Retransmissions explicites pour retrouver une branche après une partition.
                for (const own of [...s.linkVotes.values()].filter(v => v.signerId === view.nodeId))
                    broadcast(own);
                const tip = blocks.get(view.headId);
                if (tip && tip.header.height > 0)
                    broadcast(ctx.sign({ kind: 'blockResponse', block: tip }));
                // Seul le validateur sélectionné pour ce créneau construit et diffuse une proposition.
                if (ctx.proposerForSlot(slot) === view.nodeId) {
                    const b = ctx.buildBlock(view, view.headId, slot);
                    const m = ctx.sign({ kind: 'proposal', block: b });
                    receive(m, view.nodeId);
                    broadcast(m);
                }
                if (stake(view.nodeId) > 0)
                    effects.push({ kind: 'armTimer', timerId: `head:${slot}`,
                        atMs: slot * view.config.slotDurationMs + Math.floor(view.config.slotDurationMs * 2 / 3), generation: 1 });
                if (slot + 1 < view.config.maxSlots)
                    effects.push({ kind: 'armTimer', timerId: `slot:${slot + 1}`,
                        atMs: (slot + 1) * view.config.slotDurationMs, generation: 1 });
                settle();
            }
            else if (kind === 'head' && slot > s.lastHeadVotedSlot && slot < s.nextSlot
                && view.nowMs === slot * view.config.slotDurationMs + Math.floor(view.config.slotDurationMs * 2 / 3)) {
                settle();
                s.lastHeadVotedSlot = slot;
                // Le validateur signe son avis sur la tête qu'il connaît, après les livraisons déjà survenues dans ce créneau.
                const vote = ctx.sign({ kind: 'headVote', slot, blockId: view.headId });
                effects.push({ kind: 'recordVote', vote });
                receive(vote, view.nodeId);
                broadcast(vote);
                settle();
            }
        }
        // Le moteur n'est invité à modifier sa branche qu'après la décision complète de l'adaptateur.
        if (view.headId !== originalView.headId)
            effects.push({ kind: 'setHead', blockId: view.headId });
        return { nextProtocolState: s, effects };
    }
}
