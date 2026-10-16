// apps/server/test/telegram.test.ts
import { describe, expect, it, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.JARVIS_DATA_DIR = mkdtempSync(join(tmpdir(), 'jarvis-tg-'));
process.env.JARVIS_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { build } = await import('../src/index.js');
const { telegramBot } = await import('../src/telegram.js');

afterAll(() => {
  telegramBot.stop();
});

describe('telegram bot', () => {
  it('baslangicta calismiyor ve token yapilandirilmamis', async () => {
    const app = await build({ llm: { complete: async () => ({ text: 'ok', toolCalls: [] }) } as never });
    const res = await app.inject({ method: 'GET', url: '/api/telegram/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ running: false, configured: false });
  });

  it('start/stop rotalari calisir', async () => {
    const app = await build({ llm: { complete: async () => ({ text: 'ok', toolCalls: [] }) } as never });
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/telegram/start',
      payload: { token: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz' },
    });
    expect(startRes.statusCode).toBe(200);
    expect(startRes.json()).toEqual({ ok: true });

    const statusRes = await app.inject({ method: 'GET', url: '/api/telegram/status' });
    expect(statusRes.json()).toMatchObject({ running: true, configured: true });

    const stopRes = await app.inject({ method: 'POST', url: '/api/telegram/stop' });
    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.json()).toEqual({ ok: true });

    const statusRes2 = await app.inject({ method: 'GET', url: '/api/telegram/status' });
    expect(statusRes2.json()).toMatchObject({ running: false, configured: true });
  });
});
