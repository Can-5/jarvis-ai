import { z } from 'zod';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const Tier = z.enum(['L1', 'L2', 'L3']);
export type Tier = z.infer<typeof Tier>;

export const BadgeId = z.enum(['chat', 'ses', 'kod', 'arastirma', 'siber', 'ogretmen', 'yazar', 'planlayici', 'tamir', 'guvenlik']);
export type BadgeId = z.infer<typeof BadgeId>;

export const ProviderId = z.enum(['ollama', 'gemini', 'claude', 'openai', 'grok', 'openrouter']);
export type ProviderId = z.infer<typeof ProviderId>;

export const ChatMessage = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  ts: z.number(),
  imageUrl: z.string().optional(),
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
  vision?: boolean;
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
