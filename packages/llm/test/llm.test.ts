// packages/llm/test/llm.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.JARVIS_DATA_DIR = mkdtempSync(join(tmpdir(), 'jarvis-'));
process.env.JARVIS_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { KeyStore } = await import('../src/keystore.js');
const { complete } = await import('../src/providers.js');

describe('keystore', () => {
  it('kaydedilen anahtari geri verir', async () => {
    const ks = new KeyStore();
    await ks.save('openrouter', 'sk-test-123');
    expect(await ks.get('openrouter')).toBe('sk-test-123');
  });
  it('kayitli olmayan null doner', async () => {
    expect(await new KeyStore().get('grok')).toBeNull();
  });
});

describe('complete', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('openrouter tool-call normalize eder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: {
        content: 'bakiyorum',
        tool_calls: [{ function: { name: 'fs_read', arguments: '{"path":"a.txt"}' } }],
      } }],
    }))));
    const ks = new KeyStore();
    await ks.save('openrouter', 'sk-x');
    const res = await complete({ provider: 'openrouter', model: 'x/y:free',
      messages: [{ role: 'user', content: 'oku', ts: 1 }] }, ks);
    expect(res.toolCalls).toEqual([{ name: 'fs_read', args: { path: 'a.txt' } }]);
    expect(res.text).toBe('bakiyorum');
  });
});
