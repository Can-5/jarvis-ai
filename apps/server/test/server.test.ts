// apps/server/test/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.JARVIS_DATA_DIR = mkdtempSync(join(tmpdir(), 'jarvis-srv-'));
process.env.JARVIS_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { build } = await import('../src/index.js');
const { registerBot, getBot } = await import('../src/bot.js');

describe('server', () => {
  it('health cevap verir', async () => {
    const app = await build({ llm: { complete: vi.fn(async () => ({ text: 'ok', toolCalls: [] })) } as never });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ ok: true });
  });
  it('chat mesaji cevap doner', async () => {
    const app = await build({ llm: { complete: vi.fn(async () => ({ text: 'selam kanka', toolCalls: [] })) } as never });
    const res = await app.inject({ method: 'POST', url: '/api/chat',
      payload: { conv: 'c1', text: 'selam', badges: ['chat'] } });
    expect(res.json()).toMatchObject({ reply: 'selam kanka' });
  });
  it('status kurulum durumunu doner', async () => {
    const app = await build({ llm: { complete: vi.fn(async () => ({ text: 'ok', toolCalls: [] })) } as never });
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.json()).toMatchObject({ saglayici: 'ollama', model: 'qwen3-coder:30b' });
  });
  it('bot prizi kayit alir', () => {
    registerBot({ onText: async () => 'pong', onVoice: async () => 'ses-pong' });
    expect(getBot()).toBeDefined();
  });
  it('voice-profile proxy calisir', async () => {
    const { createServer } = await import('node:http');
    const mock = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ subs: {} }));
    });
    await new Promise<void>((r) => mock.listen(18765, r));
    process.env.JARVIS_VOICE_URL = 'http://localhost:18765';
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/voice-profile/ilkaycan' });
    mock.close();
    expect(res.statusCode).toBe(200);
  });
});
