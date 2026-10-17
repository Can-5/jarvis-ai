// packages/agent-core/test/agent.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.JARVIS_DATA_DIR = mkdtempSync(join(tmpdir(), 'jarvis-core-'));
const { runTurn, correctPeltek, BADGES } = await import('../src/agent.js');
const { loadSkills } = await import('../src/skills.js');

const fakeLlm = {
  complete: vi.fn(async (req: { messages: { content: string }[] }) => {
    const last = req.messages[req.messages.length - 1]?.content ?? '';
    if (last.includes('dosya yaz')) {
      return { text: '', toolCalls: [{ name: 'fs_write', args: { wsDir: '/tmp', path: 'x', content: 'y' } }] };
    }
    if (last.startsWith('DUZELT:')) return { text: last.replace('DUZELT:', '').replaceAll('c', 'ç'), toolCalls: [] };
    return { text: 'merhaba, nasilsin?', toolCalls: [] };
  }),
};

describe('rozetler', () => {
  it('9 rozet tanimli', () => {
    expect(Object.keys(BADGES)).toHaveLength(9);
    expect(BADGES.siber.prompt).toMatch(/dry-run/i);
  });
});

describe('correctPeltek', () => {
  it('sozlukteki harfi duzeltir', async () => {
    const out = await correctPeltek('cok seker', { subs: { c: 'ç' } }, [], fakeLlm as never);
    expect(out).toContain('ç');
  });
});

describe('runTurn', () => {
  it('L2 tool icin onay ister, calistirmaz', async () => {
    const res = await runTurn({ text: 'dosya yaz', badges: ['kod'], mode: 'normal', approvals: [], provider: 'ollama', model: 'test-model' }, fakeLlm as never);
    expect(res.approvals).toHaveLength(1);
    expect(res.approvals[0]?.tool).toBe('fs_write');
  });
  it('duz metinde cevap doner', async () => {
    const res = await runTurn({ text: 'selam', badges: ['chat'], mode: 'normal', approvals: [], provider: 'ollama', model: 'test-model' }, fakeLlm as never);
    expect(res.reply).toContain('merhaba');
  });
});

describe('loadSkills', () => {
  it('SKILL.md okur', async () => {
    const { mkdtempSync: mk } = await import('node:fs');
    const d = mk(join(tmpdir(), 'skills-'));
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(join(d, 'demo'));
    writeFileSync(join(d, 'demo', 'SKILL.md'), '# Demo\nAciklama satiri.\nTools: fs_read, web_fetch\n');
    expect(loadSkills(d)).toEqual([{ name: 'demo', description: 'Aciklama satiri.', tools: ['fs_read', 'web_fetch'] }]);
  });
});
