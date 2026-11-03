import type { PowSimulation } from './powEngine.js';
import { SimulationPlayback } from './playback.js';
// Les colonnes de preuve PoW et de confirmations remplacent les colonnes de votes/finalité.
export function buildPowReport(run: PowSimulation) {
    const reader = new SimulationPlayback(run); reader.seekTime(reader.durationMs);
    const view = reader.snapshot(run.scenario.observerNodeId);
    const blockRows = view.blocks.map(b => ({ bloc: b.label, hauteur: b.height, mineur: b.proposer, tempsMs: b.timeMs,
        parent: b.parentId ? reader.label(b.parentId) : 'aucun', paiements: b.transactionCount, travailCumule: b.work,
        confirmations: b.confirmations, etat: b.retained ? 'branche retenue, réversible' : 'hors branche',
        transactions: reader.blocks.get(b.id)!.transactions.map(tx => `${tx.from} > ${tx.to} : ${tx.amount} (nonce ${tx.nonce})`).join(' ; ') || 'bloc vide' }));
    const miningRows = view.mining.map(row => ({ mineur: row.miner, bloc: row.label, tempsMs: row.timeMs,
        decouverteSimulee: row.discoveryId, travailCumule: row.work, connuIci: row.knownLocally, retenu: row.retained }));
    const transactionRows = view.transactions.map(tx => ({ transaction: tx.id, de: tx.from, vers: tx.to, montant: tx.amount,
        nonce: tx.nonce, bloc: tx.block, confirmations: tx.confirmations, etat: tx.status }));
    const nodeRows = view.nodes.map(n => ({ noeud: n.id, puissance: n.hashPower, decouvertes: n.discoveries, tete: n.head, travail: n.cumulativeWork, attente: n.pending }));
    return { protocol: 'pow', scenario: run.scenario.id, blockRows, miningRows, transactionRows, nodeRows, voteRows: [] as Record<string, unknown>[],
        summary: view.summary, merchant: run.scenario.merchant ? run.merchantState : null };
}
