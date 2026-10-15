// packages/agent-core/src/skills.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Skill { name: string; description: string; tools: string[]; }

export function loadSkills(dir: string): Skill[] {
  if (!existsSync(dir)) return [];
  const out: Skill[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const f = join(dir, e.name, 'SKILL.md');
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, 'utf8').split('\n');
    const toolsLine = lines.find((l) => l.startsWith('Tools:')) ?? 'Tools:';
    out.push({
      name: e.name,
      description: lines.find((l) => l.trim() && !l.startsWith('#'))?.trim() ?? e.name,
      tools: toolsLine.replace('Tools:', '').split(',').map((s) => s.trim()).filter(Boolean),
    });
  }
  return out;
}
