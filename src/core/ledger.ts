import { hash, sign, verify } from './primitives.js';
import type { Block, Ledger, Protocol, Transaction } from './types.js';
export const ACCOUNTS = ['alice', 'benji', 'kam', 'lea', 'mallory', 'marchand'];
export function accountIds(count = 6): string[] { return Array.from({ length: count }, (_, i) => ACCOUNTS[i] ?? `utilisateur-${String(i + 1).padStart(2, '0')}`); }
export function genesisLedger(ids = ACCOUNTS): Ledger { return Object.fromEntries(ids.map(id => [id, { balance: 1000, nonce: 0 }])); }
export function transaction(from: string, to: string, amount: number, nonce: number): Transaction {
    const unsigned = { from, to, amount, nonce };
    const id = hash({ version: 1, ...unsigned });
    return { id, ...unsigned, signature: sign(from, id) };
}
export function validTransaction(t: Transaction, ids = ACCOUNTS) {
    return t && ids.includes(t.from) && ids.includes(t.to) && Number.isSafeInteger(t.amount) && t.amount > 0 && t.amount <= 100000 && Number.isSafeInteger(t.nonce) && t.nonce >= 0 && t.nonce < 100000 && t.id === hash({ version: 1, from: t.from, to: t.to, amount: t.amount, nonce: t.nonce }) && verify(t.from, t.id, t.signature);
}
export function applyTransactions(parent: Ledger, txs: Transaction[]): Ledger {
    const state = structuredClone(parent);
    const ids = new Set<string>();
    for (const t of txs) {
        if (!validTransaction(t, Object.keys(parent)) || ids.has(t.id))
            throw new Error('TX_INVALID');
        ids.add(t.id);
        if (state[t.from].nonce !== t.nonce)
            throw new Error('NONCE_CONFLICT');
        if (state[t.from].balance < t.amount)
            throw new Error('INSUFFICIENT_BALANCE');
        state[t.from].balance -= t.amount;
        state[t.to].balance += t.amount;
        state[t.from].nonce++;
    }
    return state;
}
export function blockPayload(b: Omit<Block, 'id' | 'signature'> | Block) {
    const { parent, height, producer, time, txs, protocol, slot, work } = b;
    return { version: 1, parent, height, producer, time, txs: txs.map(t => t.id), protocol, slot, work };
}
export function makeBlock(parent: Block, producer: string, time: number, txs: Transaction[], protocol: Protocol, slot = 0): Block {
    const payload = { parent: parent.id, height: parent.height + 1, producer, time, txs, protocol, slot, work: parent.work + 1 };
    const id = hash(blockPayload(payload));
    return { ...payload, id, signature: sign(producer, id) };
}
export function genesis(protocol: Protocol): Block { return { id: hash({ genesis: 1, protocol }), parent: null, height: 0, producer: 'genesis', time: 0, txs: [], protocol, slot: -1, work: 0, signature: '' }; }
export function validateBlock(block: Block, parent: Block, ledger: Ledger, capacity: number, ids: string[]) {
    if (!block || block.protocol !== parent.protocol || !ids.includes(block.producer) || block.parent !== parent.id || block.height !== parent.height + 1 || block.work !== parent.work + 1 || !Number.isSafeInteger(block.time) || block.time < parent.time || !Number.isSafeInteger(block.slot) || !Array.isArray(block.txs) || block.txs.length > capacity || block.id !== hash(blockPayload(block)) || !verify(block.producer, block.id, block.signature))
        throw new Error('BLOCK_INVALID');
    return applyTransactions(ledger, block.txs);
}
export function ancestors(blocks: Map<string, Block>, head: string): Block[] { const result: Block[] = []; let b = blocks.get(head); while (b) {
    result.push(b);
    b = b.parent ? blocks.get(b.parent) : undefined;
} return result.reverse(); }
export function descends(blocks: Map<string, Block>, child: string, parent: string): boolean { let b = blocks.get(child); while (b) {
    if (b.id === parent)
        return true;
    b = b.parent ? blocks.get(b.parent) : undefined;
} return false; }
