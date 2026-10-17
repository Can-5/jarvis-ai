// packages/agent-core/src/agent.ts
import { BADGES } from './badges.js';
import { decide, isDangerous, snapshot, type Mode } from '@jarvis/guard';
import { allTools } from '@jarvis/tools';
import { complete as defaultComplete } from '@jarvis/llm';
import { KeyStore } from '@jarvis/llm';
import type { BadgeId, ChatMessage, Kisisilik, ProviderId, RuhHali, ToolCall } from '@jarvis/shared';

export { BADGES };
export interface VoiceProfile { subs: Record<string, string>; }
export interface TurnInput {
  text: string; badges: BadgeId[]; mode: Mode;
  approvals: { tool: string; ok: boolean }[];
  conv?: string; wsDir?: string;
  provider: ProviderId; model: string;
  vision?: boolean;
  kisisilik?: Kisisilik;
  ruh_hali?: RuhHali;
}
export interface TurnResult {
  reply: string;
  approvals: { tool: string; args: Record<string, unknown>; reason: string }[];
}
type Llm = { complete: typeof defaultComplete };

export async function correctPeltek(
  raw: string, profile: VoiceProfile, last3: string[], llm: Llm,
  provider: ProviderId = 'ollama', model = 'qwen3:8b',
): Promise<string> {
  let fixed = raw;
  for (const [from, to] of Object.entries(profile.subs)) fixed = fixed.split(from).join(to);
  if (fixed === raw) return raw;
  const ks = new KeyStore();
  const res = await llm.complete({
    provider, model,
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
  const personalityDesc = input.kisisilik ? ` KISILLIK: ${input.kisisilik}` : '';
  const moodDesc = input.ruh_hali ? ` RUH HALI: ${input.ruh_hali}` : '';
  const fullSystem = system + personalityDesc + moodDesc;
  const messages: ChatMessage[] = [
    { role: 'system', content: fullSystem, ts: 1 },
    { role: 'user', content: input.text, ts: 2 },
  ];
  const approvals: TurnResult['approvals'] = [];
  let reply = '';
  const ks = new KeyStore();
  for (let i = 0; i < 5; i++) {
    const res = await llm.complete({
      provider: input.provider, model: input.model, vision: Boolean(input.vision),
      messages,
      tools: usable.map((t) => ({ name: t.name, describe: t.describe })),
    }, ks);
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
