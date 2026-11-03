import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Simulation, FUSION_MODEL } from '../src/fusion/engine.js';
import type { Config } from '../src/core/types.js';
import { distributedRoutes } from './distributed/routes.js';
interface Session {
    sim: Simulation;
    token: string;
    playing: boolean;
    speed: number;
    last: number;
    commands: Set<string>;
    sockets: Set<WebSocket>;
}
export function makeServer(options: {
    staticDir?: string;
    maxSessions?: number;
    origins?: string[];
} = {}) {
    const sessions = new Map<string, Session>();
    const distributed = distributedRoutes();
    const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
    const root = resolve(options.staticDir ?? 'dist');
    const maxSessions = options.maxSessions ?? 8;
    const json = (res: ServerResponse, status: number, data: any) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    async function body(req: IncomingMessage) { let total = 0, text = ''; for await (const chunk of req) {
        total += chunk.length;
        if (total > 32768)
            throw new Error('BODY_TOO_LARGE');
        text += chunk;
    } return JSON.parse(text || '{}'); }
    function authorized(s: Session, token: string) { const a = Buffer.from(s.token), b = Buffer.from(token); return a.length === b.length && timingSafeEqual(a, b); }
    function originAllowed(origin: string | undefined, host: string | undefined) { return !origin || origin === `http://${host}` || origin === `https://${host}` || (options.origins ?? []).includes(origin); }
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (req.headers.origin && !originAllowed(req.headers.origin, req.headers.host)) {
            json(res, 403, { error: { code: 'ORIGIN_FORBIDDEN' } });
            return;
        }
        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        }
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            if (await distributed.handle(req, res, url.pathname)) return;
            if (url.pathname === '/api/health') {
                json(res, 200, { status: 'ok', model: FUSION_MODEL, transport: 'WebSocket' });
                return;
            }
            if (url.pathname === '/api/runs' && req.method === 'POST') {
                if (sessions.size >= maxSessions) {
                    json(res, 429, { error: { code: 'SESSION_LIMIT' } });
                    return;
                }
                const config = await body(req) as Partial<Config>;
                const sim = new Simulation(config);
                const id = randomUUID(), token = randomBytes(24).toString('hex');
                sessions.set(id, { sim, token, playing: false, speed: 4, last: Date.now(), commands: new Set(), sockets: new Set() });
                json(res, 201, { id, token, snapshot: sim.snapshot() });
                return;
            }
            const match = url.pathname.match(/^\/api\/runs\/([a-zA-Z0-9-]+)(?:\/(snapshot|events|export|commands))?$/);
            if (match) {
                const s = sessions.get(match[1]);
                if (!s) {
                    json(res, 404, { error: { code: 'RUN_NOT_FOUND' } });
                    return;
                }
                const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
                if (!authorized(s, token)) {
                    json(res, 403, { error: { code: 'RUN_FORBIDDEN' } });
                    return;
                }
                s.last = Date.now();
                const route = match[2] ?? 'snapshot';
                if (req.method === 'DELETE' && !match[2]) {
                    for (const ws of s.sockets)
                        ws.close();
                    sessions.delete(match[1]);
                    json(res, 200, { deleted: true });
                    return;
                }
                if (route === 'commands' && req.method === 'POST') {
                    const b = await body(req);
                    if (typeof b.commandId !== 'string' || b.commandId.length > 100 || !['play', 'pause', 'step', 'speed'].includes(b.command))
                        throw new Error('COMMAND_INVALID');
                    if (!s.commands.has(b.commandId)) {
                        if ((b.command === 'play' && s.sim.done) || (b.command === 'step' && s.playing)) {
                            json(res, 409, { error: { code: 'RUN_STATE_CONFLICT' } });
                            return;
                        }
                        if (b.command === 'play')
                            s.playing = true;
                        if (b.command === 'pause')
                            s.playing = false;
                        if (b.command === 'step')
                            s.sim.step();
                        if (b.command === 'speed') {
                            if (![1, 2, 4, 8].includes(b.speed))
                                throw new Error('SPEED_INVALID');
                            s.speed = b.speed;
                        }
                        if (s.commands.size > 10000)
                            throw new Error('COMMAND_LIMIT');
                        s.commands.add(b.commandId);
                    }
                    json(res, 200, s.sim.snapshot());
                    return;
                }
                if (req.method !== 'GET') {
                    json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED' } });
                    return;
                }
                if (route === 'export')
                    json(res, 200, s.sim.export());
                else if (route === 'events') {
                    const after = Number(url.searchParams.get('after') ?? -1);
                    if (!Number.isSafeInteger(after) || after < -1)
                        throw new Error('CURSOR_INVALID');
                    json(res, 200, { events: s.sim.trace.filter(e => e.seq > after), nextSeq: s.sim.trace.length });
                }
                else if (route === 'snapshot')
                    json(res, 200, s.sim.snapshot());
                else
                    json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED' } });
                return;
            }
            if (url.pathname.startsWith('/api/')) {
                json(res, 404, { error: { code: 'NOT_FOUND' } });
                return;
            }
            if (!['GET', 'HEAD'].includes(req.method ?? '')) {
                json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED' } });
                return;
            }
            const pathname = decodeURIComponent(url.pathname);
            const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
            const relative = path.slice(root.length);
            if (!path.startsWith(root) || relative.includes('..') || !['/', '\\'].some(s => relative.startsWith(s))) {
                json(res, 403, { error: { code: 'PATH_FORBIDDEN' } });
                return;
            }
            const info = await stat(path);
            if (!info.isFile()) {
                json(res, 404, { error: { code: 'NOT_FOUND' } });
                return;
            }
            const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json' };
            res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=600', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss: https:; worker-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'" });
            res.end(req.method === 'HEAD' ? undefined : await readFile(path));
        }
        catch (e) {
            const message = (e as Error).message;
            json(res, message === 'ENOENT' || (e as any).code === 'ENOENT' ? 404 : 400, { error: { code: message.startsWith('CONFIG') || message.startsWith('PBFT') || message.startsWith('ATTACK') ? message : message === 'BODY_TOO_LARGE' ? 'BODY_TOO_LARGE' : 'REQUEST_INVALID' } });
        }
    });
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '/', 'http://localhost'), match = url.pathname.match(/^\/api\/runs\/([a-zA-Z0-9-]+)\/stream$/);
        const s = match ? sessions.get(match[1]) : undefined;
        if (!s || !authorized(s, url.searchParams.get('token') ?? '') || !originAllowed(req.headers.origin, req.headers.host)) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, ws => { s.sockets.add(ws); s.last = Date.now(); ws.send(JSON.stringify({ type: 'snapshot', snapshot: s.sim.snapshot() })); ws.on('close', () => s.sockets.delete(ws)); ws.on('error', () => s.sockets.delete(ws)); });
    });
    const interval = setInterval(() => {
        for (const [id, s] of sessions) {
            if (Date.now() - s.last > 20 * 60 * 1000) {
                for (const ws of s.sockets)
                    ws.close();
                sessions.delete(id);
                continue;
            }
            if (s.playing && !s.sim.done) {
                s.sim.advance(Math.min(s.sim.time + 200 * s.speed, s.sim.config.duration), 300);
                if (s.sim.done)
                    s.playing = false;
                const data = JSON.stringify({ type: 'snapshot', snapshot: s.sim.snapshot() });
                for (const ws of s.sockets)
                    if (ws.readyState === WebSocket.OPEN) {
                        if (ws.bufferedAmount > 2000000) {
                            ws.close(1008, 'Client trop lent');
                            continue;
                        }
                        ws.send(data);
                    }
            }
        }
    }, 200);
    interval.unref();
    server.on('close', () => { void distributed.close(); clearInterval(interval); for (const s of sessions.values())
        for (const ws of s.sockets)
            ws.close(); wss.close(); });
    return { server, sessions };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PORT ?? 4173), host = process.env.HOST ?? '127.0.0.1';
    const { server } = makeServer({ origins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean) });
    server.listen(port, host, () => console.log(`Local: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
