// packages/guard/src/index.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tier, ToolDef } from '@jarvis/shared';

const exec = promisify(execFile);
export type Mode = 'normal' | 'otonom';

export const DANGEROUS: RegExp[] = [
  /\brm\s+(-[a-z]*r[a-z]*|--recursive)\b/, /\bsudo\b/, /\bmkfs\b/, /\bdd\b.*\bof=/,
  /:\(\)\s*\{/, /\bcurl\b.*\|\s*(ba)?sh\b/, /\bwget\b.*\|\s*(ba)?sh\b/, /\bnc\b.*-l/,
  /\bshutdown\b/, /\breboot\b/, /\bchmod\s+-R\s+777\b/,
];

export function isDangerous(cmd: string): boolean {
  return DANGEROUS.some((re) => re.test(cmd));
}

export function decide(tool: ToolDef, mode: Mode): 'auto' | 'ask' | 'deny' {
  if (tool.danger || isDangerous(tool.name)) return 'ask';
  if (tool.tier === 'L1') return 'auto';
  if (tool.tier === 'L2') return mode === 'otonom' ? 'auto' : 'ask';
  return mode === 'otonom' ? 'ask' : 'deny'; // L3
}

async function git(dir: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', args, { cwd: dir });
    return stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string };
    throw new Error(`git ${args[0]} basarisiz: ${e.stderr ?? err}`);
  }
}

export async function snapshot(wsDir: string): Promise<string> {
  try { await git(wsDir, ['rev-parse', '--git-dir']); }
  catch { await git(wsDir, ['init', '-b', 'main']); }
  await git(wsDir, ['add', '-A']);
  try { await git(wsDir, ['-c', 'user.name=jarvis', '-c', 'user.email=jarvis@local', 'commit', '-m', 'jarvis snapshot', '--allow-empty']); }
  catch { /* ilk commit bos olabilir, devam */ }
  return git(wsDir, ['rev-parse', 'HEAD']);
}

export async function rollback(wsDir: string, hash: string): Promise<void> {
  if (!/^[0-9a-f]{4,40}$/.test(hash)) throw new Error('gecersiz snapshot hash');
  await git(wsDir, ['reset', '--hard', hash]);
  await git(wsDir, ['clean', '-fd']);
}

export { scanText, isSafe, ATTACK_PATTERNS } from "./foxguard.js";
export type { AttackLevel, ScanResult } from "./foxguard.js";
