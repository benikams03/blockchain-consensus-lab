import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import type { QueueEvent } from './types.js';
export function canonical(value: any): string {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export const hash = (value: any) => bytesToHex(sha256(utf8ToBytes(canonical(value))));
const keys = new Map<string, Uint8Array>();
function key(id: string) { if (!keys.has(id))
    keys.set(id, sha256(utf8ToBytes('DEMO-ONLY-consensus-atelier-v1:' + id))); return keys.get(id)!; }
export function sign(id: string, data: any) { return bytesToHex(ed25519.sign(utf8ToBytes(canonical(data)), key(id))); }
export function verify(id: string, data: any, signature: string) {
    try {
        return ed25519.verify(hexToBytes(signature), utf8ToBytes(canonical(data)), ed25519.getPublicKey(key(id)));
    }
    catch {
        return false;
    }
}
export class Random {
    private state: number;
    constructor(seed: number) { this.state = seed >>> 0; }
    next() { let t = this.state += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
}
export class EventQueue {
    private heap: QueueEvent[] = [];
    get size() { return this.heap.length; }
    private less(a: QueueEvent, b: QueueEvent) { return a.time < b.time || (a.time === b.time && a.order < b.order); }
    push(e: QueueEvent) { const h = this.heap; h.push(e); let i = h.length - 1; while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.less(h[i], h[p]))
            break;
        [h[i], h[p]] = [h[p], h[i]];
        i = p;
    } }
    pop() { const h = this.heap; if (!h.length)
        return undefined; const root = h[0], last = h.pop()!; if (h.length) {
        h[0] = last;
        let i = 0;
        while (true) {
            let j = i;
            const l = i * 2 + 1, r = l + 1;
            if (l < h.length && this.less(h[l], h[j]))
                j = l;
            if (r < h.length && this.less(h[r], h[j]))
                j = r;
            if (i === j)
                break;
            [h[i], h[j]] = [h[j], h[i]];
            i = j;
        }
    } return root; }
}
