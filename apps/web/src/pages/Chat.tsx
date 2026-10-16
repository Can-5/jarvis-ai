// apps/web/src/pages/Chat.tsx
import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat.js';
import { getStatus, type Badge } from '../lib/api.js';

const ROZETLER: { id: Badge; ad: string }[] = [
  { id: 'chat', ad: '💬 sohbet' }, { id: 'ses', ad: '🎤 ses' }, { id: 'kod', ad: '⌨️ kod' },
  { id: 'arastirma', ad: '🔍 arastirma' }, { id: 'siber', ad: '🛡️ siber' },
  { id: 'ogretmen', ad: '📚 öğretmen' }, { id: 'yazar', ad: '✍️ yazar' }, { id: 'planlayici', ad: '🗓️ planlayici' },
];

const ROZET_LABEL: Record<string, string> = {
  chat: 'Sohbet', ses: 'Sesli', kod: 'Kod', arastirma: 'Araştırma',
  siber: 'Siber Güvenlik', ogretmen: 'Öğretmen', yazar: 'Yazar', planlayici: 'Planlayıcı',
};

export default function Chat({ goSettings, setDurum }: { goSettings?: () => void; setDurum?: (d: 'hazir' | 'dinleniyor' | 'konusuyor' | 'hata') => void }) {
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
    try {
      setDurum?.('dinleniyor');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        setKaydediyor(false);
        setDurum?.('konusuyor');
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const r = await fetch('/api/stt', { method: 'POST', body: blob });
        const { text: t } = (await r.json()) as { text: string };
        if (t) await send(t, Array.from(new Set<Badge>([...badges, 'ses'])));
        const tts = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
        if (tts.ok) {
          const url = URL.createObjectURL(await tts.blob());
          await new Audio(url).play().catch(() => undefined);
        }
        setDurum?.('hazir');
      };
      mr.onerror = () => {
        setKaydediyor(false);
        setDurum?.('hata');
      };
      rec.current = mr;
      mr.start();
      setKaydediyor(true);
    } catch {
      setKaydediyor(false);
      setDurum?.('hata');
    }
  }

  return (
    <main className="flex flex-col gap-2">
      {kurulmamis && (
        <div className="uyari">
          HENIZ MODEL YOK — ayarlardan bir API anahtari ekle veya ollama kur.
          {goSettings && <button className="vurgulu" onClick={goSettings}>ayarlara git</button>}
        </div>
      )}
      {badges.includes('ogretmen') && (
        <div className="uyari ogretmen-uyari">
          📚 Öğretmen modu etkin — basit anlatırım, örnek veririm, sona küçük bir soru sorarım. Ne öğrenmek istersin?
          <button className="vurgulu" style={{ marginTop: '0.5rem' }} onClick={() => void send('merhaba, öğretmen modunda nasıl çalışırım?', ['ogretmen'])}>örnek sor</button>
        </div>
      )}
      {offline && <p className="offline">cevrimdisisin — mesajlar baglanti gelince gonderilecek</p>}
      <div className="rozetler">
        <span className="rozet-baslik">MOD:</span>
        {ROZETLER.map((r) => (
          <button key={r.id} title={ROZET_LABEL[r.id]} className={`chip${badges.includes(r.id) ? ' chip-acik' : ''}${badges.includes(r.id) && r.id === 'ogretmen' ? ' chip-ogretmen' : badges.includes(r.id) && r.id === 'yazar' ? ' chip-yazar' : badges.includes(r.id) && r.id === 'planlayici' ? ' chip-planlayici' : badges.includes(r.id) && r.id === 'siber' ? ' chip-siber' : ''}`}
            onClick={() => toggle(r.id)}>{r.ad}</button>
        ))}
        <span className="durum-cipi">{badges.length} etkin</span>
      </div>
      <ul className="mesaj-liste flex-1 overflow-y-auto pr-2">
        {msgs.map((m, i) => (
          <li key={i} className={`mesaj ${m.from === 'ben' ? 'ben' : ''}`}>
            <div className="mesaj-avatar {m.from === 'jarvis' ? 'jarvis' : 'ben'}" aria-hidden="true">
              {m.from === 'jarvis' ? 'J' : 'S'}
            </div>
            <div className="mesaj-baloncuk {m.from === 'jarvis' ? 'jarvis' : 'ben'}">
              {m.from === 'jarvis' ? <><b>JARVIS</b>{m.text}</> : <><b>Siz</b>{m.text}</>}
            </div>
          </li>
        ))}
        {offline && <li className="mesaj"><div className="mesaj-avatar jarvis">J</div><div className="mesaj-baloncuk jarvis"><b>JARVIS</b> Bağlantı kopuk — mesajlarınız kuyruğa alındı.</div></li>}
      </ul>
      {approvals.map((a, i) => (
        <div key={i} className="approval-card">
          <p><b>{a.tool}</b> izin istiyor: {a.reason}</p>
          <button onClick={() => fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv: 'ana', tool: a.tool, ok: true }) })}>onayla</button>
          <button onClick={() => fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv: 'ana', tool: a.tool, ok: false }) })}>reddet</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="JARVIS'e bir sey soyle..."
          onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { void send(text, badges); setText(''); } }}
        />
        <button className="vurgulu" onClick={() => { if (text.trim()) { void send(text, badges); setText(''); } }}>gonder</button>
        <button className={`mikrofon ${kaydediyor ? 'kayitli' : ''}`} onClick={() => void mic()} title={kaydediyor ? 'durdur' : 'konus'} aria-label={kaydediyor ? 'ses kaydı durdur' : 'sesle konuş'}>
          {kaydediyor ? '⏹' : '🎤'}
        </button>
      </div>
    </main>
  );
}
