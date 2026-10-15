// apps/web/src/pages/Chat.tsx
import { useRef, useState } from 'react';
import { useChat } from '../hooks/useChat.js';

export default function Chat() {
  const { msgs, approvals, offline, send } = useChat('ana');
  const [text, setText] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function mic() {
    if (kaydediyor) {
      rec.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunks.current = [];
    mr.ondataavailable = (e) => chunks.current.push(e.data);
    mr.onstop = async () => {
      setKaydediyor(false);
      const blob = new Blob(chunks.current, { type: 'audio/webm' });
      const r = await fetch('/api/stt', { method: 'POST', body: blob });
      const { text: t } = (await r.json()) as { text: string };
      if (t) await send(t, ['ses', 'chat']);
      const tts = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
      if (tts.ok) {
        const url = URL.createObjectURL(await tts.blob());
        await new Audio(url).play().catch(() => undefined);
      }
    };
    rec.current = mr;
    mr.start();
    setKaydediyor(true);
  }

  return (
    <main>
      {offline && <p>cevrimdisisin — mesajlar baglanti gelince gonderilecek</p>}
      <ul>{msgs.map((m, i) => <li key={i}><b>{m.from}:</b> {m.text}</li>)}</ul>
      {approvals.map((a, i) => (
        <div key={i}>
          <p><b>{a.tool}</b> izin istiyor: {a.reason}</p>
          <button onClick={() => fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv: 'ana', tool: a.tool, ok: true }) })}>onayla</button>
          <button onClick={() => fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv: 'ana', tool: a.tool, ok: false }) })}>reddet</button>
        </div>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { void send(text); setText(''); } }} />
      <button onClick={() => { if (text.trim()) { void send(text); setText(''); } }}>gonder</button>
      <button onClick={() => void mic()}>{kaydediyor ? 'durdur' : 'konus'}</button>
    </main>
  );
}
