export type Badge = 'chat' | 'ses' | 'kod' | 'arastirma' | 'siber' | 'ogretmen' | 'yazar' | 'planlayici';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`sunucu hatasi ${res.status}`);
  return res.json() as Promise<T>;
}

export async function sendChat(conv: string, text: string, badges: Badge[]) {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv, text, badges }) });
  return json<{ reply: string; approvals: { tool: string; args: Record<string, unknown>; reason: string }[] }>(res);
}
export async function getSettings() {
  return json<Record<string, string>>(await fetch('/api/settings'));
}
export async function saveSettings(s: Record<string, string>) {
  const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
  return json<{ ok: boolean }>(res);
}
export async function saveKey(provider: string, key: string) {
  const res = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, key }) });
  return json<{ ok: boolean }>(res);
}
export async function toggleTunnel(on: boolean) {
  const res = await fetch('/api/tunnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) });
  return json<{ ok: boolean; error?: string }>(res);
}
