import { describe, expect, it, vi, afterEach } from 'vitest';
import { sendChat, saveKey } from '../src/lib/api.js';

describe('api istemcisi', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('chat cevabi reply dondurur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ reply: 'selam', approvals: [] }))));
    expect(await sendChat('c1', 'selam', ['chat'])).toEqual({ reply: 'selam', approvals: [] });
  });
  it('anahtar kaydi ok doner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
    expect(await saveKey('openrouter', 'sk-x')).toEqual({ ok: true });
  });
});
