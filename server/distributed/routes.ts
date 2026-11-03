import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DistributedNetwork } from './network.js';
export function distributedRoutes() {
  const runs = new Map<string, { network: DistributedNetwork; token: string; commands: Set<string>; last: number }>();
  const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const parse = async (req: IncomingMessage) => { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 16384) throw new Error('SIZE'); } return JSON.parse(text || '{}'); };
  const cleanup = setInterval(() => { for (const [id, r] of runs) if (Date.now() - r.last > 120000) { void r.network.close(); runs.delete(id); } }, 10000); cleanup.unref();
  return {
    async handle(req: IncomingMessage, res: ServerResponse, path: string) {
      if (!path.startsWith('/api/distributed')) return false;
      try {
        if (path === '/api/distributed' && req.method === 'GET') { json(res, 200, { supported: true, transport: 'HTTP localhost + contrôle IPC', maxRuns: 1 }); return true; }
        if (path === '/api/distributed' && req.method === 'POST') {
          if (runs.size >= 1) { json(res, 429, { error: 'DISTRIBUTED_LIMIT' }); return true; }
          const network = new DistributedNetwork(await parse(req)), token = randomBytes(24).toString('hex');
          // Reserve capacity before starting asynchronous child processes.
          runs.set(network.id, { network, token, commands: new Set(), last: Date.now() });
          try { await network.start(); json(res, 201, { id: network.id, token, snapshot: network.snapshot() }); } catch (e) { runs.delete(network.id); throw e; } return true;
        }
        const match = path.match(/^\/api\/distributed\/([a-zA-Z0-9-]+)(?:\/(commands))?$/), run = match && runs.get(match[1]);
        if (!run) { json(res, 404, { error: 'DISTRIBUTED_NOT_FOUND' }); return true; }
        const a = Buffer.from(run.token), b = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
        if (a.length !== b.length || !timingSafeEqual(a, b)) { json(res, 403, { error: 'DISTRIBUTED_FORBIDDEN' }); return true; } run.last = Date.now();
        if (req.method === 'DELETE') { await run.network.close(); runs.delete(run.network.id); json(res, 200, { deleted: true }); return true; }
        if (req.method === 'GET' && !match![2]) { json(res, 200, run.network.snapshot()); return true; }
        if (req.method === 'POST' && match![2]) { const body = await parse(req); if (typeof body.commandId !== 'string' || body.commandId.length > 100 || run.commands.size > 200) throw new Error('COMMAND'); if (!run.commands.has(body.commandId)) { await run.network.action(body.action, body.node); run.commands.add(body.commandId); } json(res, 200, run.network.snapshot()); return true; }
        json(res, 405, { error: 'METHOD' }); return true;
      } catch (e) { json(res, 400, { error: (e as Error).message }); return true; }
    },
    async close() { clearInterval(cleanup); await Promise.all([...runs.values()].map(r => r.network.close())); runs.clear(); },
  };
}
