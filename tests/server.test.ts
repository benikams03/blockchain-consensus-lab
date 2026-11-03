import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { makeServer } from '../server/index.js';
test('API, isolation, commandes idempotentes, curseur et véritable WebSocket', async () => {
    const { server } = makeServer({ maxSessions: 2 });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as {
        port: number;
    }, base = `http://127.0.0.1:${address.port}`;
    let ws: WebSocket | undefined;
    try {
        assert.equal((await fetch(base + '/api/health')).status, 200);
        const invalid = await fetch(base + '/api/runs', { method: 'POST', body: JSON.stringify({ nodeCount: 0 }) });
        assert.equal(invalid.status, 400);
        const created = await fetch(base + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(created.status, 201);
        const { id, token } = await created.json() as any;
        assert.equal((await fetch(`${base}/api/runs/${id}/snapshot`)).status, 403);
        const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
        const step = () => fetch(`${base}/api/runs/${id}/commands`, { method: 'POST', headers, body: JSON.stringify({ command: 'step', commandId: 'same-command' }) });
        const a = await (await step()).json() as any, b = await (await step()).json() as any;
        assert.equal(a.nextSeq, b.nextSeq);
        const events = await (await fetch(`${base}/api/runs/${id}/events?after=0`, { headers })).json() as any;
        assert.ok(events.events.every((e: any) => e.seq > 0));
        ws = new WebSocket(base.replace('http:', 'ws:') + `/api/runs/${id}/stream?token=${token}`);
        const [message] = await once(ws, 'message');
        assert.equal(JSON.parse(String(message)).type, 'snapshot');
        const cors = await fetch(base + '/api/runs', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: '{}' });
        assert.equal(cors.status, 403);
        ws.close();
        await once(ws, 'close');
        ws = undefined;
        assert.equal((await fetch(`${base}/api/runs/${id}`, { method: 'DELETE', headers })).status, 200);
        assert.equal((await fetch(`${base}/api/runs/${id}/snapshot`, { headers })).status, 404);
    }
    finally {
        ws?.terminate();
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
