import type { FaultEvidence, LocalView, ModuleContext } from '../../../contracts/src/index.js';
import { compareId, integer } from '../../../core/src/index.js';
// Vérification des preuves signées, indépendante de leur détection dans l'adaptateur.
// Refait les vérifications d'une preuve sans faire confiance au module qui l'a signalée.
export function verifyFaultEvidence(e: FaultEvidence, view: LocalView, ctx: ModuleContext): boolean {
    try {
        // L'empreinte de preuve lie son type, l'acteur et les deux objets ; leur ordre ne change pas son identité.
        if (e.id !== ctx.hash(['pos-fault', 1, e.kind, e.offenderId, ...[e.first.id, e.second.id].sort(compareId)]))
            return false;
        // Deux blocs différents signés par le même proposant au même créneau constituent une double proposition.
        if (e.kind === 'DOUBLE_PROPOSAL') {
            const a = e.first, b = e.second;
            return a.id !== b.id && a.header.producerId === e.offenderId && b.header.producerId === e.offenderId
                && a.header.consensus.kind === 'pos' && b.header.consensus.kind === 'pos'
                && a.header.consensus.slot === b.header.consensus.slot
                && ctx.verifyBlock(a, view.blocks, view.nowMs) && ctx.verifyBlock(b, view.blocks, view.nowMs);
        }
        const a = e.first, b = e.second;
        // Les deux votes doivent être authentiques, distincts et signés par le même validateur de mise positive.
        if (!ctx.verify(a) || !ctx.verify(b) || a.payload.kind !== 'linkVote' || b.payload.kind !== 'linkVote'
            || a.id === b.id || a.signerId !== e.offenderId || b.signerId !== e.offenderId
            || !view.config.validators.some(n => n.id === e.offenderId && n.stake > 0))
            return false;
        const p = a.payload, q = b.payload;
        if (![p.source.epoch, p.target.epoch, q.source.epoch, q.target.epoch].every(n => integer(n))
            || p.source.epoch >= p.target.epoch || q.source.epoch >= q.target.epoch)
            return false;
        // Deux liens différents visant la même époque cible constituent un double vote.
        if (e.kind === 'DOUBLE_VOTE')
            return p.target.epoch === q.target.epoch;
        // Un lien entoure l'autre si sa source est antérieure et sa cible postérieure, strictement.
        if (e.kind === 'SURROUND_VOTE')
            return (p.source.epoch < q.source.epoch && q.target.epoch < p.target.epoch)
                || (q.source.epoch < p.source.epoch && p.target.epoch < q.target.epoch);
        return false;
    }
    catch {
        return false;
    }
}
