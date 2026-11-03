// Ajoute des paiements aux profils de panne sans changer leurs mises, puissances ou stratégies.
import type { DemoScenario } from './index.js';
import type { PowScenario } from '../../contracts/src/pow.js';
import { scenarioFromSettings } from './settings.js';
import { createSeededRandom } from '../../core/src/random.js';
import { demoAccounts } from './participants.js';

export function withPresetTraffic<T extends DemoScenario | PowScenario>(scenario: T, preset: string, input: unknown): T {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Un objet de paramètres de paiements est attendu.');
    const traffic = input as Record<string, unknown>;
    if (Object.keys(traffic).some(key => !['utilisateurs', 'transactions'].includes(key))) throw new Error('Paramètre de paiements inconnu.');
    const users = traffic.utilisateurs, count = traffic.transactions;
    const scripted = preset === 'complete' ? 8 : ['conflicts', 'doubleSpend'].includes(preset) ? 2 : 0;
    const minUsers = scripted ? 3 : 2;
    if (!Number.isSafeInteger(users) || Number(users) < minUsers || Number(users) > 100
        || !Number.isSafeInteger(count) || Number(count) < scripted || Number(count) > 1000)
        throw new Error(`Ce profil demande ${minUsers} à 100 utilisateurs et ${scripted} à 1000 paiements au total.`);

    // Le parcours guidé et les doubles dépenses gardent leurs paiements essentiels en tête du plan.
    const prefix = (scenario.transactionPlan ?? []).slice(0, scripted).map(tx => ({ ...tx }));
    if (prefix.length !== scripted) throw new Error('Paiements essentiels manquants dans ce profil.');
    const pow = 'powers' in scenario;
    const originalAccounts = scenario.accounts ?? (pow ? [] : demoAccounts);
    const accounts = scenarioFromSettings({ utilisateurs: Number(users), transactions: 0 }).accounts!.map(account => ({
        ...account, initialBalance: originalAccounts.find(original => original.id === account.id)?.initialBalance ?? account.initialBalance,
    }));
    const balances = new Map(accounts.map(account => [account.id, account.initialBalance]));
    const nonces = new Map(accounts.map(account => [account.id, 0]));
    for (const tx of prefix) {
        // Deux dépenses concurrentes partagent un nonce : une seule sert à préparer les paiements suivants.
        if (nonces.get(tx.from) !== tx.nonce) continue;
        balances.set(tx.from, balances.get(tx.from)! - tx.amount);
        balances.set(tx.to, balances.get(tx.to)! + tx.amount);
        nonces.set(tx.from, tx.nonce + 1);
    }
    const nodes = scenario.nodeIds!;
    // Les paiements supplémentaires entrent chez des machines actives, hors du mineur privé.
    const entryNodes = nodes.filter(id => !scenario.offline.includes(id) && !(pow && scenario.privateAttack?.minerId === id));
    if (!entryNodes.length) throw new Error('Aucune machine active ne peut recevoir les paiements.');
    const horizon = pow ? (scenario.stopAfterBlocks ?? 24) * scenario.meanBlockTimeMs : scenario.maxSlots * (scenario.slotDurationMs ?? 1000);
    const start = prefix.length ? Math.max(...prefix.map(tx => tx.atMs)) + 1 : 0;
    const end = Math.max(start, Math.floor(horizon * 0.78));
    // Ce générateur indépendant ne consomme pas le hasard du consensus ou des livraisons réseau.
    const seed = [...scenario.seed].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 2147483646, 104729) + 1;
    const random = createSeededRandom(seed);
    const extraCount = Number(count) - prefix.length;
    const extra = Array.from({ length: extraCount }, (_, index) => {
        const funded = accounts.filter(account => balances.get(account.id)! > 0);
        const from = funded[Math.floor(random() * funded.length)].id;
        const recipients = accounts.filter(account => account.id !== from);
        const to = recipients[Math.floor(random() * recipients.length)].id;
        const amount = Math.min(balances.get(from)!, 1 + Math.floor(random() * 20));
        const nonce = nonces.get(from)!;
        balances.set(from, balances.get(from)! - amount); balances.set(to, balances.get(to)! + amount); nonces.set(from, nonce + 1);
        return { from, to, amount, nonce, atMs: start + Math.floor((end - start) * index / Math.max(1, extraCount - 1)),
            entryNodeId: entryNodes[Math.floor(random() * entryNodes.length)] };
    });
    return { ...scenario, id: `${scenario.id}-u${users}-tx${count}`, accounts, transactionPlan: [...prefix, ...extra] };
}
