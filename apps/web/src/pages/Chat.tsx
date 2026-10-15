// apps/web/src/pages/Chat.tsx
import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat.js';
import { getStatus, type Badge } from '../lib/api.js';

const ROZETLER: { id: Badge; ad: string }[] = [
  { id: 'chat', ad: '💬 sohbet' }, { id: 'ses', ad: '🎤 ses' }, { id: 'kod', ad: '⌨️ kod' },
  { id: 'arastirma', ad: '🔍 arastirma' }, { id: 'siber', ad: '🛡️ siber' },
  { id: 'ogretmen', ad: '📚 ogretmen' }, { id: 'yazar', ad: '✍️ yazar' }, { id: 'planlayici', ad: '🗓️ planlayici' },
];

export default function Chat({ goSettings }: { goSettings?: () => void }) {
  const { msgs, approvals, offline, send } = useChat('ana');
  const [text, setText] = useState('');
  const [badges, setBadges] = useState<Badge[]>(['chat']);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [kurulmamis, setKurulmamis] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    void getStatus()
      .then((d) => {
        const olmayan = !d.keys.gemini && !d.keys.claude && !d.keys.openai && !d.keys.grok && !d.keys.openrouter;
        if (olmayan && d.saglayici === 'ollama' && d.ollamaModels.length === 0) setKurulmamis(true);
      })
      .catch(() => undefined);
  }, []);

  const toggle = (b: Badge) =>
    setBadges((o) => (o.includes(b) ? (o.length === 1 ? o : o.filter((x) => x !== b)) : [...o, b]));

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
      if (t) await send(t, Array.from(new Set<Badge>([...badges, 'ses'])));
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
      {kurulmamis && (
        <div className="uyari">
          HENIZ MODEL YOK — ayarlardan bir API anahtari ekle veya ollama kur.
          {goSettings && <button onClick={goSettings}>ayarlara git</button>}
        </div>
      )}
      {offline && <p>cevrimdisisin — mesajlar baglanti gelince gonderilecek</p>}
      <div className="rozetler">
        {ROZETLER.map((r) => (
          <button key={r.id} className={`chip${badges.includes(r.id) ? ' chip-acik' : ''}`}
            onClick={() => toggle(r.id)}>{r.ad}</button>
        ))}
      </div>
      <ul>{msgs.map((m, i) => <li key={i}><b>{m.from}:</b> {m.text}</li>)}</ul>
      {approvals.map((a, i) => (
        <div key={i}>
          <p><b>{a.tool}</b> izin istiyor: {a.reason}</p>
          <button onClick={() => fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv: 'ana', tool: a.tool, ok: true }) })}>onayla</button>
          <button onClick={() => fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv: 'ana', tool: a.tool, ok: false }) })}>reddet</button>
        </div>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { void send(text, badges); setText(''); } }} />
      <button onClick={() => { if (text.trim()) { void send(text, badges); setText(''); } }}>gonder</button>
      <button onClick={() => void mic()}>{kaydediyor ? 'durdur' : 'konus'}</button>
    </main>
  );
}
