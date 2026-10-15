// apps/web/src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { getSettings, getStatus, saveSettings, saveKey, toggleTunnel } from '../lib/api.js';

const ROZETLER = ['chat', 'ses', 'kod', 'arastirma', 'siber', 'ogretmen', 'yazar', 'planlayici'] as const;
const SAGLAYICILAR = ['gemini', 'claude', 'openai', 'grok', 'openrouter'] as const;

export default function Settings() {
  const [s, setS] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [profil, setProfil] = useState('');
  const [tunnelMsg, setTunnelMsg] = useState('');
  const [durum, setDurum] = useState<{ saglayici: string; model: string; ollamaModels: string[]; keys: Record<string, boolean> } | null>(null);

  useEffect(() => {
    void getSettings().then(setS);
    void getStatus().then(setDurum).catch(() => undefined);
    void fetch('/api/voice-profile/ilkaycan').then((r) => r.json())
      .then((p: { subs: Record<string, string> }) =>
        setProfil(Object.entries(p.subs ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')))
      .catch(() => undefined);
  }, []);

  const set = (k: string) => (e: { target: { value: string } }) => setS((o) => ({ ...o, [k]: e.target.value }));

  async function kaydet() {
    await saveSettings(s);
    for (const [p, k] of Object.entries(keys)) if (k.trim()) await saveKey(p, k.trim());
    const subs = Object.fromEntries(
      profil.split('\n').map((l) => l.split('=').map((x) => x.trim())).filter((a) => a.length === 2) as [string, string][],
    );
    await fetch('/api/voice-profile/ilkaycan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subs }) });
  }

  return (
    <main>
      <h2>kisisellestirme</h2>
      <label>asistan adi<input value={s.asistan_adi ?? 'JARVIS'} onChange={set('asistan_adi')} /></label>
      <label>uyanma sozu<input value={s.uyanma ?? 'JARVIS'} onChange={set('uyanma')} /></label>
      <label>sana nasil hitap etsin<input value={s.hitap ?? ''} onChange={set('hitap')} /></label>
      <label>uslub<select value={s.uslup ?? 'samimi'} onChange={set('uslup')}>
        <option value="samimi">samimi</option><option value="resmi">resmi</option>
        <option value="kisa">kisa-oz</option><option value="detayci">detayci</option>
      </select></label>
      <label>tema<select value={s.tema ?? 'koyu'} onChange={set('tema')}>
        <option value="koyu">koyu</option><option value="acik">acik</option>
      </select></label>
      <label>konusma hizi<input type="number" step="0.1" min="0.5" max="2" value={s.tts_hiz ?? '1'} onChange={set('tts_hiz')} /></label>

      <h2>model ve saglayici</h2>
      <label>saglayici<select value={s.saglayici ?? 'ollama'} onChange={set('saglayici')}>
        <option value="ollama">ollama (yerel, anahtar gerekmez)</option>
        {SAGLAYICILAR.map((p) => <option key={p} value={p}>{p}</option>)}
      </select></label>
      <label>model<input list="modeller" value={s.model ?? 'qwen3-coder:30b'} onChange={set('model')} /></label>
      <datalist id="modeller">
        {(durum?.ollamaModels ?? []).map((m) => <option key={m} value={m} />)}
      </datalist>
      <p>{durum && durum.saglayici === 'ollama' && durum.ollamaModels.length === 0
        ? 'ollama da model yok — ya ollama kur ya yukaridan bulut saglayici sec'
        : durum ? `aktif: ${durum.saglayici} / ${durum.model}` : ''}</p>

      <h2>api anahtarlari</h2>
      {SAGLAYICILAR.map((p) => (
        <label key={p}>{p}<input type="password" placeholder={durum?.keys?.[p] ? 'kayitli' : 'kayitli degil'}
          value={keys[p] ?? ''} onChange={(e) => setKeys((o) => ({ ...o, [p]: e.target.value }))} /></label>
      ))}

      <h2>rozetler</h2>
      {ROZETLER.map((r) => (
        <label key={r}><input type="checkbox" checked={(s[`rozet_${r}`] ?? 'acik') === 'acik'}
          onChange={(e) => setS((o) => ({ ...o, [`rozet_${r}`]: e.target.checked ? 'acik' : 'kapali' }))} />{r}</label>
      ))}

      <h2>ses profili (yanlis=dogru, satir basi bir eslesme)</h2>
      <textarea rows={5} value={profil} onChange={(e) => setProfil(e.target.value)} />

      <h2>disaridan erisim</h2>
      <button onClick={() => void toggleTunnel(true).then((r) => setTunnelMsg(r.ok ? 'tunnel acik' : (r.error ?? 'hata')))}>tunnel ac</button>
      <button onClick={() => void toggleTunnel(false).then(() => setTunnelMsg('tunnel kapali'))}>kapat</button>
      <p>{tunnelMsg}</p>

      <button onClick={() => void kaydet()}>kaydet</button>
    </main>
  );
}
