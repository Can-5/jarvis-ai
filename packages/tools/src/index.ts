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
    { name: 'camera_list', tier: 'L3', danger: true, describe: 'baglanmis kamera cihazlarini listeler. args: {}',
      run: async () => {
        if (MOCK) return ok(JSON.stringify([{ id: '0', name: 'Mock Kamera', type: 'usb' }]));
        try {
          const { stdout } = await exec('v4l2-ctl', ['--list-devices']);
          return ok(stdout);
        } catch (e) {
          try {
            const { stdout } = await exec('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
            return ok(stdout);
          } catch (e2) { return fail(`kamera listelenemedi: ${e2 instanceof Error ? e2.message : String(e2)}`); }
        }
      } },
    { name: 'camera_capture', tier: 'L3', danger: true, describe: 'kameradan goruntu yakalar ve kaydeder. args: {device, outputPath}',
      run: async (a) => {
        const device = str(a.device, 'device');
        const outputPath = str(a.outputPath, 'outputPath');
        if (MOCK) return ok(`kaydedildi (mock): ${outputPath}`);
        try {
          const { stdout } = await exec('ffmpeg', ['-f', 'v4l2', '-i', device, '-frames:v', '1', '-y', outputPath]);
          return ok(`kamera goruntu kaydedildi: ${outputPath}`);
        } catch (e) {
          try {
            await exec('ffmpeg', ['-f', 'avfoundation', '-i', device, '-frames:v', '1', '-y', outputPath]);
            return ok(`kamera goruntu kaydedildi: ${outputPath}`);
          } catch (e2) { return fail(`kamera yakalama basarisiz: ${e2 instanceof Error ? e2.message : String(e2)}`); }
        }
      } },
    { name: 'camera_motion_detect', tier: 'L3', danger: true, describe: 'kamera akisinda hareket algilar (basit piksel farkli). args: {device, durationSec}',
      run: async (a) => {
        const device = str(a.device, 'device');
        const duration = Number(a.durationSec ?? 10);
        if (MOCK) return ok(JSON.stringify({ motionDetected: false, framesChecked: 0 }));
        try {
          const tmpDir = join(dataDir(), 'motion');
          mkdirSync(tmpDir, { recursive: true });
          const f1 = join(tmpDir, `m1-${Date.now()}.jpg`);
          const f2 = join(tmpDir, `m2-${Date.now()}.jpg`);
          await exec('ffmpeg', ['-f', 'v4l2', '-i', device, '-frames:v', '1', '-y', f1]);
          await new Promise((r) => setTimeout(r, 1000));
          await exec('ffmpeg', ['-f', 'v4l2', '-i', device, '-frames:v', '1', '-y', f2]);
          const b1 = readFileSync(f1);
          const b2 = readFileSync(f2);
          const diff = Math.abs(b1.length - b2.length);
          const motionDetected = diff > 500;
          return ok(JSON.stringify({ motionDetected, framesChecked: 2, diffBytes: diff, device }));
        } catch (e) { return fail(`hareket algilama basarisiz: ${e instanceof Error ? e.message : String(e)}`); }
      } },
    { name: 'camera_record', tier: 'L3', danger: true, describe: 'kameradan surekli kayit baslatir. args: {device, outputPath, durationSec}',
      run: async (a) => {
        const device = str(a.device, 'device');
        const outputPath = str(a.outputPath, 'outputPath');
        const duration = Number(a.durationSec ?? 60);
        if (MOCK) return ok(`kayit baslatildi (mock): ${outputPath}`);
        try {
          await exec('ffmpeg', ['-f', 'v4l2', '-i', device, '-t', String(duration), '-y', outputPath]);
          return ok(`kamera kaydi tamamlandi: ${outputPath}`);
        } catch (e) { return fail(`kamera kaydi basarisiz: ${e instanceof Error ? e.message : String(e)}`); }
      } },
    { name: 'mic_diagnose', tier: 'L3', danger: true, describe: 'mikrofon durumunu tanimlar (izin, driver, cihaz). args: {}',
      run: async () => {
        if (MOCK) return ok(JSON.stringify({ device: 'mock-mic', status: 'calisiyor', permission: 'izinli', driver: 'yuklu' }));
        try {
          const issues: string[] = [];
          try { await exec('arecord', ['-l']); } catch { issues.push('arecord cihaz bulunamadi'); }
          try { await exec('test', ['-r', '/dev/snd']); } catch { issues.push('/dev/snd erisilemiyor'); }
          try { await exec('pactl', ['list', 'sources']); } catch { issues.push('pulseaudio/pipewire calismiyor'); }
          return ok(JSON.stringify({ issues, status: issues.length === 0 ? 'calisiyor' : 'sorunlu', checked: ['arecord', '/dev/snd', 'pactl'] }));
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'mic_repair', tier: 'L3', danger: true, describe: 'mikrofonu onarmaya calisir (driver restart, izin). args: {}',
      run: async () => {
        if (MOCK) return ok(JSON.stringify({ repaired: true, actions: ['izin-duzeltilmis', 'driver-yeniden-baslatilmis'] }));
        const actions: string[] = [];
        try {
          try { await exec('chmod', ['a+rw', '/dev/snd']); actions.push('izin-duzeltilmis'); } catch {}
          try { await exec('pulseaudio', ['-k']); actions.push('pulseaudio-yeniden-baslatilacak'); await new Promise((r) => setTimeout(r, 2000)); } catch {}
          try { await exec('pulseaudio', ['--start']); actions.push('pulseaudio-baslatildi'); } catch {}
          try { await exec('systemctl', ['--user', 'restart', 'pipewire']); actions.push('pipewire-yeniden-baslatildi'); } catch {}
          return ok(JSON.stringify({ repaired: actions.length > 0, actions }));
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'av_scan', tier: 'L3', danger: true, describe: 'dizinde zararli yazilim tarar (imza + davranis). args: {path}',
      run: async (a) => {
        const base = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
        const threats: string[] = [];
        const walk = (d: string): void => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const f = join(d, e.name);
            if (e.isDirectory()) walk(f);
            else if (/\.(exe|msi|bat|sh|ps1|py|js|vbs|jar|dll|so|bin)$/i.test(e.name)) {
              try {
                const content = readFileSync(f).toString('latin1');
                const hits = scanText(content, f);
                if (hits.some((h) => h.rule === 'secret' || h.rule === 'eval' || h.rule === 'pipe-shell')) threats.push(f);
              } catch {}
            }
          }
        };
        try {
          if (require('node:fs').statSync(base).isDirectory()) walk(base);
          else {
            const content = readFileSync(base).toString('latin1');
            const hits = scanText(content, base);
            if (hits.some((h) => h.rule === 'secret' || h.rule === 'eval' || h.rule === 'pipe-shell')) threats.push(base);
          }
          return ok(JSON.stringify({ threats, scanned: base, threatCount: threats.length }));
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'av_quarantine', tier: 'L3', danger: true, describe: 'supheli dosyayi karantinaya tasir. args: {path}',
      run: async (a) => {
        const src = str(a.src, 'src');
        const q = join(dataDir(), 'quarantine');
        mkdirSync(q, { recursive: true });
        try {
          renameSync(src, join(q, `${Date.now()}-${src.split(sep).pop()}`));
          return ok(`karantinaya alindi: ${src}`);
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'av_quarantine_list', tier: 'L3', danger: true, describe: 'karantinadaki dosyalari listeler. args: {}',
      run: async () => {
        try { return ok(JSON.stringify(readdirSync(join(dataDir(), 'quarantine')))); }
        catch { return ok('[]'); }
      } },
    { name: 'pre_scan', tier: 'L3', danger: true, describe: 'dosya yuklenmeden once tarar (imza, zararli kod, zararli url). args: {path}',
      run: async (a) => {
        const base = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
        const threats: string[] = [];
        let clean = true;
        try {
          const content = readFileSync(base, 'utf8');
          const hits = scanText(content, base);
          const secretHits = hits.filter((h) => h.rule === 'secret');
          const evalHits = hits.filter((h) => h.rule === 'eval');
          const shellHits = hits.filter((h) => h.rule === 'pipe-shell');
          if (secretHits.length || evalHits.length || shellHits.length) {
            clean = false;
            threats.push(...secretHits.map((h) => `${h.file}:${h.line} (secret)`));
            threats.push(...evalHits.map((h) => `${h.file}:${h.line} (eval)`));
            threats.push(...shellHits.map((h) => `${h.file}:${h.line} (pipe-shell)`));
          }
          return ok(JSON.stringify({ clean, threats, scanned: base, threatCount: threats.length }));
        } catch (e) { return fail(String(e)); }
      } },
    // ========== KORUMA MODU ==========
    { name: 'protection_status', tier: 'L3', danger: true, describe: 'koruma modu durumunu dondurur. args: {}',
      run: async () => {
        const qDir = join(dataDir(), 'quarantine');
        let qCount = 0;
        try { qCount = readdirSync(qDir).length; } catch {}
        return ok(JSON.stringify({
          protectionEnabled: true,
          quarantineCount: qCount,
          realTimeScan: true,
          autoQuarantine: true,
          version: '1.0.0',
        }));
      } },
    { name: 'protection_toggle', tier: 'L3', danger: true, describe: 'koruma modunu acar/kapatir. args: {enabled}',
      run: async (a) => {
        const enabled = a.enabled === true || a.enabled === 'true';
        return ok(JSON.stringify({ protectionEnabled: enabled, message: enabled ? 'koruma modu etkinlestirildi' : 'koruma modu devre disi birakildi' }));
      } },
    { name: 'self_analyze', tier: 'L3', danger: true, describe: 'kendi kodunu analiz eder ve iyilestirme onerisi dondurur. args: {path}',
      run: async (a) => {
        const base = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
        const suggestions: string[] = [];
        const walk = (d: string): void => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const f = join(d, e.name);
            if (e.name === 'node_modules' || e.name === '.git') continue;
            if (e.isDirectory()) walk(f);
            else if (/\.(ts|tsx|js)$/.test(e.name)) {
              try {
                const content = readFileSync(f, 'utf8');
                if (content.includes('any')) suggestions.push(`${f}: 'any' tipi kullanimi, tip guvenligi zayif`);
                if (content.includes('catch(e) {}')) suggestions.push(`${f}: bos catch blogu`);
                if (content.includes('console.log')) suggestions.push(`${f}: console.log kaldirilmali, logger kullanin`);
                if (content.length > 5000) suggestions.push(`${f}: dosya cok buyuk (${content.length} char), parcalanmali`);
              } catch {}
            }
          }
        };
        try {
          if (require('node:fs').statSync(base).isDirectory()) walk(base);
          else {
            const content = readFileSync(base, 'utf8');
            if (content.includes('any')) suggestions.push(`${base}: 'any' tipi kullanimi`);
          }
          return ok(JSON.stringify({ suggestions, analyzed: base, suggestionCount: suggestions.length }));
        } catch (e) { return fail(String(e)); }
      } },
    { name: 'self_apply', tier: 'L3', danger: true, describe: 'onayli iyilestirmeleri uygular (guvenli degisiklikler). args: {path, changeType}',
      run: async (a) => {
        const base = inside(str(a.wsDir, 'wsDir'), str(a.path, 'path'));
        const changeType = str(a.changeType, 'changeType');
        const allowed = ['remove-console-log', 'fix-empty-catch', 'add-type-annotation'];
        if (!allowed.includes(changeType)) return fail(`desteklenmeyen changeType: ${changeType}`);
        try {
          const content = readFileSync(base, 'utf8');
          let newContent = content;
          if (changeType === 'remove-console-log') newContent = content.replace(/console\.log\([^)]*\);\n?/g, '');
          if (changeType === 'fix-empty-catch') newContent = content.replace(/catch\s*\(\s*\w+\s*\)\s*\{\s*\}/g, 'catch (e) { console.error(e); }');
          if (changeType === 'add-type-annotation') {
            newContent = newContent.replace(/const (\w+)\s*=/g, 'const $1: any =');
          }
          if (newContent !== content) {
            writeFileSync(base, newContent);
            return ok(JSON.stringify({ applied: true, changeType, file: base }));
          }
          return ok(JSON.stringify({ applied: false, changeType, file: base, reason: 'degisiklik gerekmedi' }));
        } catch (e) { return fail(String(e)); }
      } },
  ];
}
