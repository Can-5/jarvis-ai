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
import { BadgeId, dataDir, type ProviderId } from '@jarvis/shared';
import { KeyStore, complete as realComplete, detectOllama } from '@jarvis/llm';
import { runTurn, Memory } from '@jarvis/agent-core';
import { telegramBot, type TelegramBotAdapter } from './telegram.js';

const VOICE = (): string => process.env.JARVIS_VOICE_URL ?? 'http://localhost:8765';

function settingsDb(): Database.Database {
  const db = new Database(join(dataDir(), 'jarvis.db'));
  db.exec('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)');
  return db;
}
function setting(db: Database.Database, k: string, fb: string): string {
  const row = db.prepare('SELECT v FROM settings WHERE k = ?').get(k) as { v: string } | undefined;
  return row?.v ?? fb;
}

export async function build(deps?: { llm?: { complete: typeof realComplete } }): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(websocket);
  const llm = deps?.llm ?? { complete: realComplete };
  const ks = new KeyStore();
  const mem = new Memory();

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ollama', async () => ({ models: await detectOllama() }));

  app.get('/api/weather', async (req, reply) => {
    const q = req.query as { lat?: string; lon?: string };
    const lat = Number(q.lat ?? 42.8);
    const lon = Number(q.lon ?? -83.7);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`;
    const upstream = await fetch(url);
    if (!upstream.ok) return reply.code(upstream.status).send({ error: 'weather service failed' });
    return upstream.json();
  });

  app.post('/api/lada/qr', async (req) => {
    const body = z.object({ qrData: z.string() }).parse(req.body);
    return { ok: true, qrData: body.qrData, received: new Date().toISOString() };
  });

  app.get('/api/status', async () => {
    const db = settingsDb();
    const saglayici = setting(db, 'saglayici', 'ollama');
    const model = setting(db, 'model', 'qwen3-coder:30b');
    db.close();
    const keys: Record<string, boolean> = {};
    for (const p of ['gemini', 'claude', 'openai', 'grok', 'openrouter'] as const) {
      keys[p] = (await ks.get(p).catch(() => null)) !== null;
    }
    return { saglayici, model, ollamaModels: await detectOllama().catch(() => []), keys };
  });

  app.post('/api/chat', async (req) => {
    const body = z.object({ conv: z.string(), text: z.string(), badges: BadgeId.array().default(['chat']) }).parse(req.body);
    const history = mem.lastMessages(body.conv, 6).map((m) => `${m.role}: ${m.content}`);
    void history;
    const db = settingsDb();
    const kapali = new Set(
      body.badges.filter((b) => (db.prepare('SELECT v FROM settings WHERE k = ?').get(`rozet_${b}`) as { v: string } | undefined)?.v === 'kapali'),
    );
    const provider = setting(db, 'saglayici', 'ollama') as ProviderId;
    const model = setting(db, 'model', 'qwen3-coder:30b');
    db.close();
    const aktif = body.badges.filter((b) => !kapali.has(b));
    try {
      const res = await runTurn({ text: body.text, badges: aktif.length ? aktif : ['chat'], mode: 'normal', approvals: [], provider, model }, llm);
      mem.saveTurn(body.conv, body.text, res.reply);
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { reply: `işlemedi kanka: ${msg}`, approvals: [] };
    }
  });

  app.get('/ws/chat', { websocket: true }, (socket) => {
    socket.on('message', async (raw) => {
      const msg = JSON.parse(String(raw)) as { type: string; conv: string; text: string };
      if (msg.type !== 'user') return;
      const db = settingsDb();
      const provider = setting(db, 'saglayici', 'ollama') as ProviderId;
      const model = setting(db, 'model', 'qwen3-coder:30b');
      db.close();
      try {
        const res = await runTurn({ text: msg.text, badges: ['chat'], mode: 'normal', approvals: [], provider, model }, llm);
        mem.saveTurn(msg.conv, msg.text, res.reply);
        socket.send(JSON.stringify({ type: 'token', text: res.reply }));
        for (const a of res.approvals) socket.send(JSON.stringify({ type: 'approval', ...a }));
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        socket.send(JSON.stringify({ type: 'token', text: `işlemedi kanka: ${err}` }));
      }
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

  const telegramAdapter: TelegramBotAdapter = {
    onText: async (conv, text) => {
      const db = settingsDb();
      const provider = setting(db, 'saglayici', 'ollama') as ProviderId;
      const model = setting(db, 'model', 'qwen3-coder:30b');
      db.close();
      try {
        const res = await runTurn({ text, badges: ['chat'], mode: 'normal', approvals: [], provider, model }, llm);
        mem.saveTurn(conv, text, res.reply);
        return res.reply;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `işlemedi kanka: ${msg}`;
      }
    },
    onVoice: async (conv, audio) => {
      let text = '';
      try {
        const upstream = await fetch(`${VOICE()}/stt`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/ogg' },
          body: audio as BodyInit,
        });
        const sttRes = (await upstream.json()) as { text?: string };
        text = sttRes?.text ?? '';
      } catch {
        text = '';
      }
      if (!text) return 'anlayamadim kanka, tekrar misin?';
      const db = settingsDb();
      const provider = setting(db, 'saglayici', 'ollama') as ProviderId;
      const model = setting(db, 'model', 'qwen3-coder:30b');
      db.close();
      try {
        const res = await runTurn({ text, badges: ['ses', 'chat'], mode: 'normal', approvals: [], provider, model }, llm);
        mem.saveTurn(conv, text, res.reply);
        return res.reply;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `işlemedi kanka: ${msg}`;
      }
    },
  };
  telegramBot.setAdapter(telegramAdapter);

  app.get('/api/telegram/status', async () => ({
    running: telegramBot.isRunning(),
    configured: telegramBot.hasToken() || !!process.env.TELEGRAM_BOT_TOKEN,
  }));
  app.post('/api/telegram/start', async (req) => {
    const body = z.object({ token: z.string().min(10) }).parse(req.body);
    if (telegramBot.isRunning()) telegramBot.stop();
    await telegramBot.start(body.token);
    return { ok: true };
  });
  app.post('/api/telegram/stop', async () => {
    telegramBot.stop();
    return { ok: true };
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
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await telegramBot.start(process.env.TELEGRAM_BOT_TOKEN);
    console.log('Telegram botu baslatildi (polling)');
  }
}
