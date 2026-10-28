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
import { BadgeId, ChatMessage, Kisisilik, RuhHali, dataDir, type ProviderId } from '@jarvis/shared';
import { KeyStore, complete as realComplete, detectOllama } from '@jarvis/llm';
import { runTurn, Memory } from '@jarvis/agent-core';
import { allTools } from '@jarvis/tools';
import { scanText } from '@jarvis/guard';
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

  app.get('/api/system-stats', async () => {
    let cpuPercent = 0;
    let memTotal: number | undefined;
    let memFree: number | undefined;
    let diskTotal: number | undefined;
    let diskFree: number | undefined;

    try {
      const stat = await import('node:fs/promises').then((fs) => fs.readFile('/proc/stat', 'utf8'));
      const cpuLine = stat.split('\n').find((l) => l.startsWith('cpu '));
      if (cpuLine) {
        const parts = cpuLine.split(/\s+/).slice(1).map(Number);
        const total = parts.reduce((a, b) => a + b, 0);
        const idle = parts[3] ?? 0;
        cpuPercent = Math.round(((total - idle) / total) * 100);
      }
    } catch {}

    try {
      const meminfo = await import('node:fs/promises').then((fs) => fs.readFile('/proc/meminfo', 'utf8'));
      const memTotalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
      const memAvailableMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
      if (memTotalMatch?.[1] && memAvailableMatch?.[1]) {
        memTotal = parseInt(memTotalMatch[1], 10);
        memFree = parseInt(memAvailableMatch[1], 10);
      }
    } catch {}

    try {
      const { exec } = await import('node:child_process');
      const { stdout } = await promisify(exec)("df -B1 / 2>/dev/null | tail -1");
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 6 && parts[1] && parts[3]) {
        diskTotal = parseInt(parts[1], 10);
        diskFree = parseInt(parts[3], 10);
      }
    } catch {}

    const memUsed = (memTotal ?? 0) - (memFree ?? 0);
    const diskUsed = (diskTotal ?? 0) - (diskFree ?? 0);

    return {
      cpu: cpuPercent,
      memTotalMB: Math.round((memTotal ?? 0) / 1024),
      memUsedMB: Math.round(memUsed / 1024),
      memPercent: (memTotal ?? 0) > 0 ? Math.round((memUsed / (memTotal ?? 1)) * 100) : 0,
      diskTotalGB: Math.round((diskTotal ?? 0) / (1024 * 1024 * 1024)),
      diskUsedGB: Math.round(diskUsed / (1024 * 1024 * 1024)),
      diskPercent: (diskTotal ?? 0) > 0 ? Math.round((diskUsed / (diskTotal ?? 1)) * 100) : 0,
    };
  });

  app.post('/api/lada/qr', async (req) => {
    const body = z.object({ qrData: z.string() }).parse(req.body);
    return { ok: true, qrData: body.qrData, received: new Date().toISOString() };
  });

  app.get('/api/bluetooth/list', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'bluetooth_list');
    if (!tool) return { error: 'bluetooth_list toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { devices: result.output } : { error: result.output };
  });

  app.post('/api/bluetooth/scan', async (req) => {
    const body = z.object({ durationSec: z.number().optional() }).parse(req.body ?? {});
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'bluetooth_scan');
    if (!tool) return { error: 'bluetooth_scan toolu bulunamadi' };
    const result = await tool.run({ durationSec: body.durationSec ?? 5 });
    return result.ok ? { devices: result.output } : { error: result.output };
  });

  app.post('/api/bluetooth/connect', async (req) => {
    const body = z.object({ mac: z.string() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'bluetooth_connect');
    if (!tool) return { error: 'bluetooth_connect toolu bulunamadi' };
    const result = await tool.run({ mac: body.mac });
    return result.ok ? { ok: true, output: result.output } : { error: result.output };
  });

  app.post('/api/bluetooth/disconnect', async (req) => {
    const body = z.object({ mac: z.string() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'bluetooth_disconnect');
    if (!tool) return { error: 'bluetooth_disconnect toolu bulunamadi' };
    const result = await tool.run({ mac: body.mac });
    return result.ok ? { ok: true, output: result.output } : { error: result.output };
  });

  app.get('/api/wifi/list', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'wifi_list');
    if (!tool) return { error: 'wifi_list toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { networks: result.output } : { error: result.output };
  });

  app.post('/api/wifi/scan', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'wifi_scan');
    if (!tool) return { error: 'wifi_scan toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { networks: result.output } : { error: result.output };
  });

  app.post('/api/wifi/connect', async (req) => {
    const body = z.object({ ssid: z.string(), password: z.string().optional() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'wifi_connect');
    if (!tool) return { error: 'wifi_connect toolu bulunamadi' };
    const result = await tool.run({ ssid: body.ssid, password: body.password });
    return result.ok ? { ok: true, output: result.output } : { error: result.output };
  });

  app.post('/api/wifi/disconnect', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'wifi_disconnect');
    if (!tool) return { error: 'wifi_disconnect toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { ok: true, output: result.output } : { error: result.output };
  });

  app.get('/api/wifi/status', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'wifi_status');
    if (!tool) return { error: 'wifi_status toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { status: result.output } : { error: result.output };
  });

  app.post('/api/wake-word', async (req) => {
    const body = z.object({ word: z.string().optional(), enabled: z.boolean().optional() }).parse(req.body ?? {});
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'wake_word');
    if (!tool) return { error: 'wake_word toolu bulunamadi' };
    const result = await tool.run({ word: body.word ?? 'jarvis', enabled: body.enabled ?? true });
    return result.ok ? { ok: true, output: result.output } : { error: result.output };
  });

  app.post('/api/vad', async (req) => {
    const body = z.object({ enabled: z.boolean().optional(), threshold: z.number().optional() }).parse(req.body ?? {});
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'vad');
    if (!tool) return { error: 'vad toolu bulunamadi' };
    const result = await tool.run({ enabled: body.enabled ?? true, threshold: body.threshold ?? 0.5 });
    return result.ok ? { ok: true, output: result.output } : { error: result.output };
  });

  app.get('/api/usb/list', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'usb_list');
    if (!tool) return { error: 'usb_list toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { devices: result.output } : { error: result.output };
  });

  app.post('/api/usb/copy', async (req) => {
    const body = z.object({ src: z.string(), dst: z.string() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'usb_copy');
    if (!tool) return { error: 'usb_copy toolu bulunamadi' };
    const result = await tool.run({ src: body.src, dst: body.dst });
    return result.ok ? { ok: true, output: result.output } : { error: result.output };
  });

  app.get('/api/fs/check', async (req) => {
    const q = req.query as { device?: string };
    if (!q.device) return { error: 'device parametresi zorunlu' };
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'fs_check');
    if (!tool) return { error: 'fs_check toolu bulunamadi' };
    const result = await tool.run({ device: q.device });
    return result.ok ? { check: result.output } : { error: result.output };
  });

  app.post('/api/fs/repair', async (req) => {
    const body = z.object({ device: z.string() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'fs_repair');
    if (!tool) return { error: 'fs_repair toolu bulunamadi' };
    const result = await tool.run({ device: body.device });
    return result.ok ? { repaired: result.output } : { error: result.output };
  });

  app.get('/api/fs/scan', async (req) => {
    const q = req.query as { path?: string };
    if (!q.path) return { error: 'path parametresi zorunlu' };
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'fs_scan');
    if (!tool) return { error: 'fs_scan toolu bulunamadi' };
    const result = await tool.run({ wsDir: dataDir(), path: q.path });
    return result.ok ? { scan: result.output } : { error: result.output };
  });

  app.get('/api/camera/list', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'camera_list');
    if (!tool) return { error: 'camera_list toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { cameras: result.output } : { error: result.output };
  });

  app.post('/api/camera/capture', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'camera_capture');
    if (!tool) return { error: 'camera_capture toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { captured: result.output } : { error: result.output };
  });

  app.get('/api/camera/motion', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'camera_motion_detect');
    if (!tool) return { error: 'camera_motion_detect toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { motion: result.output } : { error: result.output };
  });

  app.post('/api/camera/record', async (req) => {
    const body = z.object({ seconds: z.number().optional() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'camera_record');
    if (!tool) return { error: 'camera_record toolu bulunamadi' };
    const result = await tool.run({ seconds: body.seconds ?? 10 });
    return result.ok ? { recorded: result.output } : { error: result.output };
  });

  app.post('/api/mic/diagnose', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'mic_diagnose');
    if (!tool) return { error: 'mic_diagnose toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { diagnose: result.output } : { error: result.output };
  });

  app.post('/api/mic/repair', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'mic_repair');
    if (!tool) return { error: 'mic_repair toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { repaired: result.output } : { error: result.output };
  });

  app.post('/api/av/scan', async (req) => {
    const body = z.object({ path: z.string() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'av_scan');
    if (!tool) return { error: 'av_scan toolu bulunamadi' };
    const result = await tool.run({ path: body.path });
    return result.ok ? { scan: result.output } : { error: result.output };
  });

  app.post('/api/av/quarantine', async (req) => {
    const body = z.object({ path: z.string() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'av_quarantine');
    if (!tool) return { error: 'av_quarantine toolu bulunamadi' };
    const result = await tool.run({ path: body.path });
    return result.ok ? { quarantined: result.output } : { error: result.output };
  });

  app.get('/api/av/quarantine-list', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'av_quarantine_list');
    if (!tool) return { error: 'av_quarantine_list toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { quarantined: result.output } : { error: result.output };
  });

  app.post('/api/pre-scan', async (req) => {
    const body = z.object({ path: z.string() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'pre_scan');
    if (!tool) return { error: 'pre_scan toolu bulunamadi' };
    const result = await tool.run({ path: body.path });
    return result.ok ? { prescan: result.output } : { error: result.output };
  });

  app.get('/api/protection/status', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'protection_status');
    if (!tool) return { error: 'protection_status toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { status: result.output } : { error: result.output };
  });

  app.post('/api/protection/toggle', async (req) => {
    const body = z.object({ on: z.boolean() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'protection_toggle');
    if (!tool) return { error: 'protection_toggle toolu bulunamadi' };
    const result = await tool.run({ on: body.on });
    return result.ok ? { toggled: result.output } : { error: result.output };
  });

  app.post('/api/self/analyze', async () => {
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'self_analyze');
    if (!tool) return { error: 'self_analyze toolu bulunamadi' };
    const result = await tool.run({});
    return result.ok ? { analysis: result.output } : { error: result.output };
  });

  app.post('/api/self/apply', async (req) => {
    const body = z.object({ fix: z.string().optional() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'self_apply');
    if (!tool) return { error: 'self_apply toolu bulunamadi' };
    const result = await tool.run({ fix: body.fix });
    return result.ok ? { applied: result.output } : { error: result.output };
  });

  app.get('/api/personality', async () => {
    const db = settingsDb();
    const k = setting(db, 'kisisilik', 'friendly');
    const r = setting(db, 'ruh_hali', 'notr');
    db.close();
    return { kisisilik: k, ruh_hali: r };
  });

  app.put('/api/personality', async (req) => {
    const body = z.object({ kisisilik: z.string().optional(), ruh_hali: z.string().optional() }).parse(req.body);
    const db = settingsDb();
    const put = db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)');
    if (body.kisisilik) put.run('kisisilik', body.kisisilik);
    if (body.ruh_hali) put.run('ruh_hali', body.ruh_hali);
    db.close();
    return { ok: true };
  });

  app.post('/api/camera/resolution', async (req) => {
    const body = z.object({ width: z.number().optional(), height: z.number().optional() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'camera_capture');
    if (!tool) return { error: 'camera_capture toolu bulunamadi' };
    const result = await tool.run({ width: body.width, height: body.height });
    return result.ok ? { resolution: result.output } : { error: result.output };
  });

  app.post('/api/camera/snapshot-schedule', async (req) => {
    const body = z.object({ intervalSeconds: z.number().optional(), count: z.number().optional() }).parse(req.body);
    const tools = allTools();
    const tool = tools.find((t) => t.name === 'camera_capture');
    if (!tool) return { error: 'camera_capture toolu bulunamadi' };
    const result = await tool.run({ intervalSeconds: body.intervalSeconds ?? 60, count: body.count ?? 10 });
    return result.ok ? { scheduled: result.output } : { error: result.output };
  });

  app.get('/api/status', async () => {
    const db = settingsDb();
    const saglayici = setting(db, 'saglayici', 'ollama');
    const model = setting(db, 'model', 'qwen3-coder:30b');
    const visionProvider = setting(db, 'visionProvider', 'ollama');
    const visionModel = setting(db, 'visionModel', 'llava');
    db.close();
    const keys: Record<string, boolean> = {};
    for (const p of ['gemini', 'claude', 'openai', 'grok', 'openrouter'] as const) {
      keys[p] = (await ks.get(p).catch(() => null)) !== null;
    }
    return { saglayici, model, visionProvider, visionModel, ollamaModels: await detectOllama().catch(() => []), keys };
  });

  app.post('/api/chat', async (req) => {
    const body = z.object({ conv: z.string(), text: z.string(), badges: BadgeId.array().default(['chat']), imageUrl: z.string().optional(), vision: z.boolean().optional() }).parse(req.body);
    const scan = scanText(body.text);
    if (!scan.safe) {
      return { reply: `FoxGuard: giriş engellendi (${scan.level}) — ${scan.reason}`, approvals: [] };
    }
    const history = mem.lastMessages(body.conv, 6).map((m) => `${m.role}: ${m.content}`);
    void history;
    const db = settingsDb();
    const kapali = new Set(
      body.badges.filter((b) => (db.prepare('SELECT v FROM settings WHERE k = ?').get(`rozet_${b}`) as { v: string } | undefined)?.v === 'kapali'),
    );
    const useVision = body.vision === true;
    const provider = useVision ? (setting(db, 'visionProvider', 'ollama') as ProviderId) : (setting(db, 'saglayici', 'ollama') as ProviderId);
    const model = useVision ? setting(db, 'visionModel', 'llava') : setting(db, 'model', 'qwen3-coder:30b');
    const kisisilik = setting(db, 'kisisilik', 'friendly') as 'reserved' | 'friendly' | 'professional' | 'humorous' | 'strict' | 'empathetic' | 'curious' | 'confident';
    const ruh_hali = setting(db, 'ruh_hali', 'notr') as 'mutlu' | 'uzgun' | 'notr' | 'heyecanli' | 'sakin' | 'enerjik' | 'merakli';
    db.close();
    const aktif = body.badges.filter((b) => !kapali.has(b));
    const messages: ChatMessage[] = [{ role: 'user', content: body.text, ts: Date.now(), ...(body.imageUrl ? { imageUrl: body.imageUrl } : {}) }];
    try {
      const res = await runTurn({ text: body.text, badges: aktif.length ? aktif : ['chat'], mode: 'normal', approvals: [], provider, model, vision: useVision, kisisilik, ruh_hali }, llm as never);
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

  app.post('/api/voice/enroll', async (req) => {
    const body = z.object({ user: z.string() }).parse(req.body);
    const upstream = await fetch(`${VOICE()}/voice/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return upstream.json();
  });

  app.post('/api/voice/verify', async (req) => {
    const body = z.object({ user: z.string() }).parse(req.body);
    const upstream = await fetch(`${VOICE()}/voice/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return upstream.json();
  });

  app.post('/api/voice/spoof-check', async () => {
    const upstream = await fetch(`${VOICE()}/voice/spoof-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return upstream.json();
  });

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
