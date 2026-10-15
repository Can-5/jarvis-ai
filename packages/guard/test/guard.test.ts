// packages/guard/test/guard.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide, isDangerous, snapshot, rollback, type Mode } from '../src/index.js';
import type { ToolDef } from '@jarvis/shared';

const tool = (tier: 'L1' | 'L2' | 'L3', danger = false): ToolDef =>
  ({ name: 't', tier, danger, describe: 't', run: async () => ({ ok: true, output: '' }) });

describe('decide', () => {
  it('L1 her zaman otomatiktir', () => {
    expect(decide(tool('L1'), 'normal')).toBe('auto');
    expect(decide(tool('L1'), 'otonom')).toBe('auto');
  });
  it('L2 normalde sorar, otonomda otomatiktir', () => {
    expect(decide(tool('L2'), 'normal')).toBe('ask');
    expect(decide(tool('L2'), 'otonom')).toBe('auto');
  });
  it('tehlikeli her zaman sorar', () => {
    expect(decide(tool('L2', true), 'otonom')).toBe('ask');
  });
  it('L3 normalde yasaktir', () => {
    expect(decide(tool('L3'), 'normal')).toBe('deny');
    expect(decide(tool('L3'), 'otonom')).toBe('ask');
  });
});

describe('isDangerous', () => {
  it('rm -rf ve sudo tehlikelidir', () => {
    expect(isDangerous('rm -rf /tmp/x')).toBe(true);
    expect(isDangerous('sudo dnf install foo')).toBe(true);
    expect(isDangerous('ls -la')).toBe(false);
  });
});

describe('snapshot/rollback', () => {
  it('degisikligi geri alir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'));
    writeFileSync(join(dir, 'a.txt'), 'v1');
    const h1 = await snapshot(dir);
    writeFileSync(join(dir, 'a.txt'), 'v2');
    await rollback(dir, h1);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('v1');
  });
});
