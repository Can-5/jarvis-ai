// apps/web/src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { getSettings, getStatus, saveSettings, saveKey, toggleTunnel } from '../lib/api.js';

const ROZETLER = ['chat', 'ses', 'kod', 'arastirma', 'siber', 'ogretmen', 'yazar', 'planlayici'] as const;
const ROZET_LABEL: Record<string, string> = {
  chat: 'Sohbet', ses: 'Sesli', kod: 'Kod', arastirma: 'Araştırma',
  siber: 'Siber Güvenlik', ogretmen: 'Öğretmen', yazar: 'Yazar', planlayici: 'Planlayıcı',
};
const SAGLAYICILAR = ['gemini', 'claude', 'openai', 'grok', 'openrouter'] as const;
const SAGLAYICI_LABEL: Record<string, string> = {
  gemini: 'Gemini', claude: 'Claude', openai: 'ChatGPT', grok: 'Grok', openrouter: 'OpenRouter',
};

export default function Settings() {
  const [s, setS] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [profil, setProfil] = useState('');
  const [tunnelMsg, setTunnelMsg] = useState('');
  const [durum, setDurum] = useState<{ saglayici: string; model: string; ollamaModels: string[]; keys: Record<string, boolean> } | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  async function acTunnel() {
    const r = await toggleTunnel(true);
    setTunnelMsg(r.ok ? 'tunnel açıldı' : (r.error ?? 'hata'));
  }
  async function kapaTunnel() {
    await toggleTunnel(false);
    setTunnelMsg('tunnel kapatıldı');
  }

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
    setKaydediliyor(true);
    try {
      await saveSettings(s);
      for (const [p, k] of Object.entries(keys)) if (k.trim()) await saveKey(p, k.trim());
      const subs = Object.fromEntries(
        profil.split('\n').map((l) => l.split('=').map((x) => x.trim())).filter((a) => a.length === 2) as [string, string][],
      );
      await fetch('/api/voice-profile/ilkaycan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subs }) });
      setTunnelMsg('ayarlar kaydedildi');
    } catch (e) {
      setTunnelMsg('kaydetme hatasi: ' + String(e));
    } finally {
      setKaydediliyor(false);
      setTimeout(() => setTunnelMsg(''), 2500);
    }
  }

  return (
    <main className="space-y-2">
      <div className="topbar">
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Ayarlar</h1>
      </div>

      {/* Kişiselleştirme */}
      <section className="panel">
        <h2>Kişiselleştirme</h2>
        <label>Asistan adı<input value={s.asistan_adi ?? 'JARVIS'} onChange={set('asistan_adi')} /></label>
        <label>Uyanma sözü<input value={s.uyanma ?? 'JARVIS'} onChange={set('uyanma')} /></label>
        <label>Sana nasıl hitap etsin<input value={s.hitap ?? ''} onChange={set('hitap')} /></label>
        <label>Üslup<select value={s.uslup ?? 'samimi'} onChange={set('uslup')}>
          <option value="samimi">Samimi</option><option value="resmi">Resmi</option>
          <option value="kisa">Kısa-öz</option><option value="detayci">Detaycı</option>
        </select></label>
        <label>Tema<select value={s.tema ?? 'koyu'} onChange={set('tema')}>
          <option value="koyu">Koyu</option><option value="acik">Açık</option>
        </select></label>
        <label>Konuşma hızı<input type="number" step="0.1" min="0.5" max="2" value={s.tts_hiz ?? '1'} onChange={set('tts_hiz')} /></label>
      </section>

      {/* Model ve sağlayıcı */}
      <section className="panel">
        <h2>Model ve Sağlayıcı</h2>
        <label>Sağlayıcı<select value={s.saglayici ?? 'ollama'} onChange={set('saglayici')}>
          <option value="ollama">Ollama (yerel, anahtar gerekmez)</option>
          {SAGLAYICILAR.map((p) => <option key={p} value={p}>{SAGLAYICI_LABEL[p]}</option>)}
        </select></label>
        <label>Model<input list="modeller" value={s.model ?? 'qwen3-coder:30b'} onChange={set('model')} /></label>
        <datalist id="modeller">
          {(durum?.ollamaModels ?? []).map((m) => <option key={m} value={m} />)}
        </datalist>
        <p style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {durum && durum.saglayici === 'ollama' && durum.ollamaModels.length === 0
            ? 'Ollama-da model yok — Ollama kurun veya yukarıdan bulut sağlayıcı seçin'
            : durum ? `Aktif: ${durum.saglayici} / ${durum.model}` : ''}
        </p>
        <p style={{ marginTop: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Anahtarlarınız şifreli olarak yerelde saklanır, sohbette asla gösterilmez.
        </p>
      </section>

      {/* API Anahtarları */}
      <section className="panel">
        <h2>API Anahtarları</h2>
        <p style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Aşağıya eklemek istediğiniz sağlayıcıların API anahtarlarını girin. Boş bırakılırsa bu sağlayıcı kullanılmaz.
        </p>
        {SAGLAYICILAR.map((p) => (
          <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ minWidth: '110px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{SAGLAYICI_LABEL[p]}</span>
            <input type="password" placeholder={durum?.keys?.[p] ? 'kayıtlı' : 'kayıtlı değil'}
              value={keys[p] ?? ''} onChange={(e) => setKeys((o) => ({ ...o, [p]: e.target.value }))} style={{ flex: 1 }} />
          </label>
        ))}
      </section>

      {/* Rozetler / Modlar */}
      <section className="panel">
        <h2>Rozetler / Modlar</h2>
        <p style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Sohbet etkinleştirmek istediğiniz modları işaretleyin. En az bir mod açık kalmalıdır.
        </p>
        <div className="rozetler">
          {ROZETLER.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={(s[`rozet_${r}`] ?? 'acik') === 'acik'}
                onChange={(e) => setS((o) => ({ ...o, [`rozet_${r}`]: e.target.checked ? 'acik' : 'kapali' }))} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{ROZET_LABEL[r]}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Ses profili */}
      <section className="panel">
        <h2>Ses Profili (yanlış = doğru, satır başı bir eşleşme)</h2>
        <textarea rows={5} value={profil} onChange={(e) => setProfil(e.target.value)} placeholder="p=b\nç=s" />
        <p style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Peltek konuşmaları düzeltmek için harf eşlemeleri girin. Örn: p=b, ç=s, ş=s
        </p>
      </section>

      {/* Dışarıdan erişim */}
      <section className="panel">
        <h2>Dışarıdan Erişim</h2>
        <div className="tunnel-butonlar">
          <button onClick={acTunnel}>Tunnel aç</button>
          <button onClick={kapaTunnel}>Kapat</button>
        </div>
        <p className="kucuk-metin">{tunnelMsg}</p>
      </section>

      <button className="vurgulu" onClick={() => void kaydet()} disabled={kaydediliyor} style={{ marginTop: '1rem', width: '100%' }}>
        {kaydediliyor ? 'kaydediliyor...' : 'kaydet'}
      </button>
    </main>
  );
}
