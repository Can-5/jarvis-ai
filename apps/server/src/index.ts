// apps/server/src/index.ts
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { BadgeId, dataDir } from '@jarvis/shared';
import { KeyStore, complete as realComplete, detectOllama } from '@jarvis/llm';
import { runTurn, Memory } from '@jarvis/agent-core';

const VOICE = (): string => process.env.JARVIS_VOICE_URL ?? 'http://localhost:8765';

function settingsDb(): Database.Database {
  const db = new Database(join(dataDir(), 'jarvis.db'));
  db.exec('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)');
  return db;
}

export async function build(deps?: { llm?: { complete: typeof realComplete } }): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(websocket);
  const llm = deps?.llm ?? { complete: realComplete };
  const ks = new KeyStore();
  const mem = new Memory();

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ollama', async () => ({ models: await detectOllama() }));

  app.post('/api/chat', async (req) => {
    const body = z.object({ conv: z.string(), text: z.string(), badges: BadgeId.array().default(['chat']) }).parse(req.body);
    const history = mem.lastMessages(body.conv, 6).map((m) => `${m.role}: ${m.content}`);
    void history;
    const db = settingsDb();
    const kapali = new Set(
      body.badges.filter((b) => (db.prepare('SELECT v FROM settings WHERE k = ?').get(`rozet_${b}`) as { v: string } | undefined)?.v === 'kapali'),
    );
    db.close();
    const aktif = body.badges.filter((b) => !kapali.has(b));
    const res = await runTurn({ text: body.text, badges: aktif.length ? aktif : ['chat'], mode: 'normal', approvals: [] }, llm);
    mem.saveTurn(body.conv, body.text, res.reply);
    return res;
  });

  app.get('/ws/chat', { websocket: true }, (socket) => {
    socket.on('message', async (raw) => {
      const msg = JSON.parse(String(raw)) as { type: string; conv: string; text: string };
      if (msg.type !== 'user') return;
      const res = await runTurn({ text: msg.text, badges: ['chat'], mode: 'normal', approvals: [] }, llm);
      mem.saveTurn(msg.conv, msg.text, res.reply);
      socket.send(JSON.stringify({ type: 'token', text: res.reply }));
      for (const a of res.approvals) socket.send(JSON.stringify({ type: 'approval', ...a }));
      socket.send(JSON.stringify({ type: 'done' }));
    });
  });

  app.post('/api/approve', async (req) => {
    const body = z.object({ conv: z.string(), tool: z.string(), ok: z.boolean() }).parse(req.body);
    return { recorded: true, ...body };
  });

  app.get('/api/settings', async () => {
    const db = settingsDb();
    const rows = db.prepare('SELECT k, v FROM settings').all() as { k: string; v: string }[];
    db.close();
    return Object.fromEntries(rows.map((r) => [r.k, r.v]));
  });
  app.put('/api/settings', async (req) => {
    const body = z.record(z.string()).parse(req.body);
    const db = settingsDb();
    const put = db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)');
    for (const [k, v] of Object.entries(body)) put.run(k, v);
    db.close();
    return { ok: true };
  });
  app.post('/api/keys', async (req) => {
    const body = z.object({ provider: z.enum(['gemini', 'claude', 'openai', 'grok', 'openrouter']), key: z.string().min(4) }).parse(req.body);
    await ks.save(body.provider, body.key);
    return { ok: true };
  });

  // Voice proxy: PWA tek adresle konusur, voice servisine yonlendirilir.
  for (const route of ['stt', 'tts'] as const) {
    app.post(`/api/${route}`, async (req, reply) => {
      const upstream = await fetch(`${VOICE()}/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] ?? 'application/octet-stream' },
        body: req.body as BodyInit,
      });
      reply.status(upstream.status);
      reply.header('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    });
  }

  app.get('/api/voice-profile/:user', async (req) => {
    const { user } = req.params as { user: string };
    const r = await fetch(`${VOICE()}/profile/${encodeURIComponent(user)}`);
    return r.json();
  });
  app.put('/api/voice-profile/:user', async (req) => {
    const { user } = req.params as { user: string };
    const r = await fetch(`${VOICE()}/profile/${encodeURIComponent(user)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
    return r.json();
  });

  app.post('/api/tunnel', async (req) => {
    const body = z.object({ on: z.boolean() }).parse(req.body);
    if (!body.on) {
      await promisify(exec)("pkill -f 'cloudflared.*3000'").catch(() => undefined);
      return { ok: true, off: true };
    }
    const { spawn } = await import('node:child_process');
    try {
      await promisify(exec)('which cloudflared');
    } catch { return { ok: false, error: 'cloudflared kurulu degil: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/' }; }
    const child = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3000'], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, note: 'tunnel baslatildi, URL terminalde ve logda gorunur' };
  });

  const here = new URL('.', import.meta.url).pathname;
  const webDist = [
    join(process.cwd(), 'apps/web/dist'),
    join(process.cwd(), '..', 'web/dist'),
    join(here, '..', '..', '..', 'web/dist'),
    join(here, '..', '..', 'apps', 'web', 'dist'),
  ].find((p) => existsSync(join(p, 'index.html')));
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
        return reply.code(404).send({ error: 'Not Found', statusCode: 404 });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

const isMain = process.argv[1]?.endsWith('server/dist/src/index.js') ?? false;
if (isMain || process.env.JARVIS_SERVE === '1') {
  const app = await build();
  await app.listen({ port: 3000, host: '0.0.0.0' });
  console.log('JARVIS server :3000 dinliyor');
}
