// packages/guard/src/foxguard.ts
// FoxGuard saldırı kalıbı tespiti (FoxGuard v2'den port edilmiş).
// Zero-telemetry, yerel, yalnızca kalıp eşleştirme.

export type AttackLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

export const ATTACK_PATTERNS: Partial<Record<AttackLevel, RegExp[]>> = {
  critical: [
    /os\.system\(/i, /subprocess\.(run|call|Popen)\(/i, /exec\(/i,
    /pickle\.loads\(/i, /yaml\.load\(/i, /shell\s*=\s*True/i,
    /rm\s+-rf\s+\//i, /chmod\s+777/i, /union\s+select/i, /drop\s+table/i,
    /\$\{.*\}/, /eval\(/i, /__import__\(/i, /socket\./i, /reverse\s+shell/i,
  ],
  high: [
    /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*=.*['"]\s*\+\s*/i, /innerHTML\s*=/i,
    /document\.write\(/i, /<script/i, /on\w+\s*=/i,
  ],
  medium: [
    /open\(.*['"].*['"].*['"]w['"]/i, /shutil\.rmtree\(/i, /os\.remove\(/i,
    /os\.unlink\(/i, /chmod\s+/i, /base64\.(b64decode|b64encode)\(/i, /hashlib\.md5\(/i,
  ],
  low: [/print\(/i, /input\(/i, /json\.(loads|dumps)\(/i],
};

const WEIGHTS: Record<AttackLevel, number> = { critical: 10, high: 7, medium: 4, low: 1, none: 0 };

export interface ScanResult {
  safe: boolean;
  level: AttackLevel;
  reason: string;
}

export function scanText(text: string): ScanResult {
  if (!text) return { safe: true, level: 'none', reason: '' };
  for (const level of ['critical', 'high', 'medium', 'low'] as AttackLevel[]) {
    for (const re of ATTACK_PATTERNS[level] ?? []) {
      const m = re.exec(text);
      if (m) {
        return { safe: level !== 'critical' && level !== 'high', level, reason: `Saldırı kalıbı (${level}): ${re.source.slice(0, 60)}` };
      }
    }
  }
  return { safe: true, level: 'none', reason: '' };
}

export function isSafe(text: string): boolean {
  return scanText(text).safe;
}

export { WEIGHTS };
