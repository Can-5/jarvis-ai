// apps/web/src/hooks/useChat.ts
import { useState } from 'react';
import { sendChat, type Badge } from '../lib/api.js';

export interface Msg { from: 'ben' | 'jarvis'; text: string; }
export interface Approval { tool: string; args: Record<string, unknown>; reason: string; }

export function useChat(conv: string) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [offline, setOffline] = useState(false);

  async function send(text: string, badges: Badge[] = ['chat']) {
    setMsgs((m) => [...m, { from: 'ben', text }]);
    try {
      const res = await sendChat(conv, text, badges);
      setOffline(false);
      setMsgs((m) => [...m, { from: 'jarvis', text: res.reply }]);
      setApprovals(res.approvals);
      const q: string[] = JSON.parse(localStorage.getItem('jarvis-kuyruk') ?? '[]');
      if (q.length) {
        localStorage.setItem('jarvis-kuyruk', '[]');
        for (const t of q) await send(t, badges);
      }
    } catch {
      setOffline(true);
      const q: string[] = JSON.parse(localStorage.getItem('jarvis-kuyruk') ?? '[]');
      localStorage.setItem('jarvis-kuyruk', JSON.stringify([...q, text]));
    }
  }
  return { msgs, approvals, offline, send, setApprovals };
}
