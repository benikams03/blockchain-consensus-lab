import type { Config, Protocol } from './types.js';
import { consensusIndices } from './participants.js';
export const DEFAULT_CONFIG: Config = { protocol: 'pow', seed: 42, nodeCount: 7, consensusNodes: [], latencyMin: 120, latencyMax: 700, duration: 90000, blockInterval: 4000, slotDuration: 3000, epochLength: 4, capacity: 5, txInterval: 1600, confirmations: 3, attack: 'none', attackerShare: .55, faultyNodes: 1, attackStart: 6000, releaseAt: 45000, accountCount: 6, transactionCount: 40, resources: [], offlineNodes: [], faultBehavior: 'default' };
export function configuration(input: Partial<Config> = {}): Config {
    const allowed = Object.keys(DEFAULT_CONFIG);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k)))
        throw new Error('CONFIG_UNKNOWN_FIELD');
    const c = { ...DEFAULT_CONFIG, ...input };
    if (!['pow', 'pos', 'pbft'].includes(c.protocol) || !['none', 'majority', 'double', 'byzantine', 'partition'].includes(c.attack) || !['default', 'silent', 'withhold', 'equivocate', 'surround', 'invalid'].includes(c.faultBehavior))
        throw new Error('CONFIG_ENUM');
    const ranges: Record<string, [
        number,
        number
    ]> = { seed: [0, 4294967295], nodeCount: [1, 64], latencyMin: [0, 5000], latencyMax: [0, 10000], duration: [10000, 300000], blockInterval: [1000, 20000], slotDuration: [1000, 12000], epochLength: [2, 8], capacity: [1, 30], txInterval: [300, 10000], confirmations: [1, 100], faultyNodes: [0, 63], attackStart: [0, 200000], releaseAt: [1000, 290000], accountCount: [2, 100], transactionCount: [0, 1000] };
    for (const [k, [min, max]] of Object.entries(ranges)) {
        const v = c[k as keyof Config];
        if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
            throw new Error('CONFIG_RANGE:' + k);
    }
    if (!Array.isArray(c.consensusNodes) || c.consensusNodes.some(i=>!Number.isSafeInteger(i)||i<0||i>=c.nodeCount) || new Set(c.consensusNodes).size!==c.consensusNodes.length) throw new Error('CONFIG_CONSENSUS_MEMBERS');
    if (!Array.isArray(c.resources)) throw new Error('CONFIG_RESOURCES');
    c.consensusNodes=consensusIndices(c).sort((a,b)=>a-b);
    if (!c.consensusNodes.length) throw new Error('CONFIG_CONSENSUS_EMPTY');
    if (c.consensusNodes.length === 1 && input.faultyNodes === undefined) c.faultyNodes = 0;
    if (c.latencyMax < c.latencyMin || c.faultyNodes >= c.nodeCount || !Number.isFinite(c.attackerShare) || c.attackerShare < .05 || c.attackerShare > .95 || c.attackStart >= c.duration || c.releaseAt <= c.attackStart || c.releaseAt >= c.duration)
        throw new Error('CONFIG_COMBINATION');
    if (!Array.isArray(c.resources) || (c.resources.length && (c.resources.length !== c.nodeCount || c.resources.some(n => !Number.isSafeInteger(n) || n < 0 || n > 1e9) || c.resources.reduce((a, b) => a + b, 0) <= 0 || c.resources.reduce((a, b) => a + b, 0) > 1e9))) throw new Error('CONFIG_RESOURCES');
    if (!Array.isArray(c.offlineNodes) || c.offlineNodes.some(n => !Number.isSafeInteger(n) || n < 0 || n >= c.nodeCount) || new Set(c.offlineNodes).size !== c.offlineNodes.length) throw new Error('CONFIG_OFFLINE');
    c.resources = [...c.resources]; c.offlineNodes = [...c.offlineNodes];
    if (c.resources.length && c.resources.some((w,i)=>c.consensusNodes.includes(i)?w<=0:w!==0)) throw new Error('CONFIG_RESOURCE_ROLE_MISMATCH');
    if (c.faultyNodes >= c.consensusNodes.length) throw new Error('CONFIG_FAULTY_COMMITTEE');
    if (c.protocol === 'pbft' && ![4, 7, 10].includes(c.consensusNodes.length))
        throw new Error('PBFT_NODE_COUNT');
    if (c.protocol !== 'pow' && ['majority', 'double'].includes(c.attack))
        throw new Error('ATTACK_REQUIRES_POW');
    if (c.protocol === 'pow' && c.attack === 'byzantine')
        throw new Error('ATTACK_REQUIRES_BFT');
    if (c.protocol === 'pbft' && c.resources.length) throw new Error('PBFT_ONE_IDENTITY_ONE_VOTE');
    if (c.attack === 'byzantine' && !c.faultyNodes) throw new Error('CONFIG_FAULTY_REQUIRED');
    if (['majority', 'double'].includes(c.attack) && (c.consensusNodes.length < 2 || c.offlineNodes.includes(c.consensusNodes[0]))) throw new Error('CONFIG_ATTACKER_REQUIRED');
    return c;
}
export function protocolDefaults(protocol: Protocol): Partial<Config> { return { protocol, nodeCount: protocol === 'pbft' ? 4 : 7, consensusNodes: [], attack: 'none', resources: [], offlineNodes: [], faultBehavior: 'default', faultyNodes: 1 }; }
