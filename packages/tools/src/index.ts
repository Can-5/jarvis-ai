// packages/tools/src/index.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { isDangerous } from '@jarvis/guard';
import { dataDir, type ToolDef, type ToolResult } from '@jarvis/shared';

const exec = promisify(execFile);
const ok = (output: string): ToolResult => ({ ok: true, output });
const fail = (output: string): ToolResult => ({ ok: false, output });
const MOCK = process.env.JARVIS_MOCK_HW === '1';

function inside(wsDir: string, p: string): string {
  const full = resolve(wsDir, p);
  const rel = relative(resolve(wsDir), full);
  if (rel.startsWith('..') || resolve(full) !== full) throw new Error('ws disina erisim yasak');
  if (rel.split(sep).includes('..')) throw new Error('ws disina erisim yasak');
  return full;
}
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(`'${name}' metin olmali`);
  return v;
};

const SECRET_RES = [/sk-ant-[A-Za-z0-9-_]{8,}/, /sk-[A-Za-z0-9]{16,}/, /xox[bap]-/, /AKIA[0-9A-Z]{16}/, /-----BEGIN .*PRIVATE KEY-----/];

function scanText(content: string, file: string): { rule: string; file: string; line: number }[] {
  const out: { rule: string; file: string; line: number }[] = [];
  content.split('\n').forEach((line, i) => {
    if (SECRET_RES.some((re) => re.test(line))) out.push({ rule: 'secret', file, line: i + 1 });
    if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(line)) out.push({ rule: 'http-url', file, line: i + 1 });
    if (/\beval\s*\(/.test(line)) out.push({ rule: 'eval', file, line: i + 1 });
    if (/\.innerHTML\s*=/.test(line)) out.push({ rule: 'innerHTML', file, line: i + 1 });
  });
  return out;
}

export function allTools(): ToolDef[] {
  return [
    { name: 'fs_read', tier: 'L1', danger: false, describe: 'ws icindeki dosyayi okur. args: {wsDir, path}',
      run: async (a) => {
        try { return ok(readFileSync(inside(str(a.wsDir, 'wsDir'), str(a.path, 'path')), 'utf8')); }
        catch (e) { return fail(String(e)); }
      } },
    { name: 'fs_write', tier: 'L2', danger: false, describe: 'ws icine dosya yazar. args: {wsDir, path, content}',
      run: async (a) => {
        try {
          const full = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
          mkdirSync(join(full, '..'), { recursive: true });
          writeFileSync(full, str(a.content, 'content'));
          return ok('yazildi');
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'shell', tier: 'L2', danger: false, describe: 'ws dizininde shell komutu. args: {wsDir, cmd}',
      run: async (a) => {
        const cmd = str(a.cmd, 'cmd');
        if (isDangerous(cmd)) return fail('tehlikeli komut calistirilmadi');
        try {
          const { stdout, stderr } = await exec(cmd, { cwd: str(a.wsDir, 'wsDir'), shell: '/bin/bash', timeout: 60000 });
          return ok((stdout + stderr).slice(0, 8000));
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'screenshot', tier: 'L1', danger: false, describe: 'ekran goruntusu alir, dosya yolunu doner. args: {}',
      run: async () => {
        if (MOCK) return ok('/tmp/jarvis-mock.png');
        const out = join(dataDir(), `ekran-${Date.now()}.png`);
        try { await exec('spectacle', ['-b', '-n', '-o', out]); return ok(out); }
        catch (e) { return fail(String(e)); }
      } },
    { name: 'mouse_click', tier: 'L2', danger: false, describe: 'fare tiklamasi. args: {x, y}',
      run: async (a) => {
        if (MOCK) return ok('tiklandi (mock)');
        try { await exec('ydotool', ['click', '0xC0']); return ok('tiklandi'); }
        catch (e) { return fail(String(e)); }
      } },
    { name: 'key_press', tier: 'L2', danger: false, describe: 'klavye tusu. args: {key}',
      run: async (a) => {
        if (MOCK) return ok('basildi (mock)');
        try { await exec('ydotool', ['key', str(a.key, 'key')]); return ok('basildi'); }
        catch (e) { return fail(String(e)); }
      } },
    { name: 'web_fetch', tier: 'L1', danger: false, describe: 'URL icerigini metin olarak getirir. args: {url}',
      run: async (a) => {
        try {
          const res = await fetch(str(a.url, 'url'), { signal: AbortSignal.timeout(15000) });
          return ok((await res.text()).slice(0, 12000));
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'site_scan', tier: 'L1', danger: false, describe: 'uretilen kodu tarar (secret, http, eval, innerHTML). args: {wsDir, path}',
      run: async (a) => {
        const base = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
        const files: string[] = [];
        const walk = (d: string): void => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === '.git') continue;
            const f = join(d, e.name);
            if (e.isDirectory()) walk(f);
            else if (/\.(js|ts|tsx|jsx|py|html|env|json)$/.test(e.name)) files.push(f);
          }
        };
        try {
          if (statSync(base).isDirectory()) walk(base); else files.push(base);
          const findings = files.flatMap((f) => scanText(readFileSync(f, 'utf8'), f));
          return ok(JSON.stringify(findings));
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'file_check', tier: 'L1', danger: false, describe: 'dosyayi hash+imza ile kontrol eder, supheliyi karantinaya tasir. args: {wsDir, path}',
      run: async (a) => {
        try {
          const full = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
          const content = readFileSync(full, 'utf8');
          const sha = createHash('sha256').update(content).digest('hex');
          const hits = scanText(content, full).filter((f) => f.rule === 'secret' || f.rule === 'eval')
            .concat(/curl.*\|\s*(ba)?sh|powershell.*-enc/i.test(content) ? [{ rule: 'pipe-shell', file: full, line: 0 }] : []);
          if (!hits.length) return ok(JSON.stringify({ sha256: sha, temiz: true }));
          const q = join(dataDir(), 'quarantine');
          mkdirSync(q, { recursive: true });
          renameSync(full, join(q, `${Date.now()}-${full.split(sep).pop()}`));
          return fail(`supheli (${hits.map((h) => h.rule).join(',')}) karantinaya alindi. sha256=${sha}`);
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'quarantine', tier: 'L2', danger: false, describe: 'karantinadaki dosyalari listeler. args: {}',
      run: async () => {
        try { return ok(JSON.stringify(readdirSync(join(dataDir(), 'quarantine')))); }
        catch { return ok('[]'); }
      } },
    { name: 'usb_list', tier: 'L3', danger: true, describe: 'baglanmis USB/disk cihazlarini listeler (lsblk). args: {}',
      run: async () => {
        try {
          const { stdout } = await exec('lsblk', ['-J', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,MODEL']);
          return ok(stdout);
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'usb_copy', tier: 'L3', danger: true, describe: 'dosyayi USB/hedef dizine kopyalar. args: {src, dst}',
      run: async (a) => {
        const src = str(a.src, 'src');
        const dst = str(a.dst, 'dst');
        try {
          await exec('cp', ['-r', src, dst]);
          return ok(`kopyalandi: ${src} -> ${dst}`);
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'fs_check', tier: 'L3', danger: true, describe: 'dosya sistemini kontrol eder (fsck -N dry-run). args: {device}',
      run: async (a) => {
        const device = str(a.device, 'device');
        try {
          const { stdout } = await exec('fsck', ['-N', device]);
          return ok(stdout);
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'fs_repair', tier: 'L3', danger: true, describe: 'dosya sistemini onarir (fsck -y). args: {device}',
      run: async (a) => {
        const device = str(a.device, 'device');
        try {
          const { stdout } = await exec('fsck', ['-y', device], { timeout: 300000 });
          return ok(stdout);
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'fs_scan', tier: 'L3', danger: true, describe: 'dizinde bozuk/geri yuklenemeyebilecek dosyalari tarar. args: {path}',
      run: async (a) => {
        const base = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
        const corrupt: string[] = [];
        const walk = (d: string): void => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const f = join(d, e.name);
            if (e.isDirectory()) walk(f);
            else {
              try {
                const fd = require('node:fs').openSync(f, 'r');
                require('node:fs').closeSync(fd);
              } catch { corrupt.push(f); }
            }
          }
        };
        try {
          if (require('node:fs').statSync(base).isDirectory()) walk(base);
          else corrupt.push(base);
          return ok(JSON.stringify({ corrupt, count: corrupt.length }));
        } catch (e) { return fail(String(e)); }
      } },
  ];
}
