// packages/llm/src/providers.ts
import type { ChatMessage, LlmRequest, LlmResponse, ProviderId, ToolCall } from '@jarvis/shared';
import type { KeyStore } from './keystore.js';

const OPENAI_COMPAT: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  grok: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: m.content },
    ];
    if (m.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: m.imageUrl } });
    }
    return {
      role: m.role === 'tool' ? 'tool' : m.role,
      content: content.length === 1 ? m.content : content,
    };
  });
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
  const base = OPENAI_COMPAT[req.provider];
  if (!base) throw new Error(`bilinmeyen saglayici: ${req.provider}`);
  return completeOpenAiCompat(base, key, req);
}

export function isVisionProvider(provider: ProviderId): boolean {
  return ['ollama', 'openai', 'grok', 'openrouter'].includes(provider);
}

export type { ProviderId };
