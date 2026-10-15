# JARVIS Plan C — Web PWA + Entegrasyon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React PWA (sohbet + ses + ayarlar: kişiselleştirme, anahtarlar, rozetler, ses profili, tunnel), `jarvis` CLI + systemd, skills tohumu, GitHub push.

**Architecture:** `apps/web` sadece sunucu API'sini tüketir (iş mantığı yok); ayarlar `/api/settings` + `/api/keys` üstünde; PWA manifest + service worker ile ana ekrana kurulur, çevrimdışıyken kuyruğa yazar, bağlantıda gönderir.

**Tech Stack:** React + Vite + TailwindCSS + vite-plugin-pwa, vitest + @testing-library/react.

**Spec:** jarvis/docs/superpowers/specs/2026-10-15-jarvis-design.md (Bölüm 5, 6; Faz-1; Faz-2 prizi)

## Global Constraints

- Tasarımda `apple-design` + `frontend-design` skill'leri uygulanır (implementasyondan önce ikisini de oku).
- Tüm arayüz metinleri Türkçe; tema açık/koyu; mobil öncelikli.
- `data/` commit'lenmez; API anahtarları input'ta maskeli.
- Conventional commits.
- Plan A ve B'nin API sözleşmeleri değişmez: `/api/chat`, `/ws/chat` (`token|approval|done`), `/api/settings`, `/api/keys`, `/api/stt`, `/api/tts`, `/api/tunnel`, `/profile/{user}` (voice, web sunucu üstünden `/api/voice-profile` proxy'si ile — Task 2'de eklenir).

---

### Task 1: Web iskeleti + PWA + API istemcisi

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/lib/api.ts`, `apps/web/public/icon.svg`, `apps/web/test/api.test.ts`

**Interfaces:**
- Consumes: Plan A HTTP sözleşmesi.
- Produces: `apiGet/apiPost` (JSON), `sendChat(conv, text, badges)`, `getSettings/saveSettings`, `saveKey`, `toggleTunnel`. PWA manifest (isim JARVIS, icon.svg).

- [ ] **Step 1: Scaffold + failing test**

Run: `npm create vite@latest apps/web -- --template react-ts` (mevcut dizin yapısına uyarla; çakışırsa dosyaları taşı). Sonra:

```bash
npm install -w apps/web && npm install -w apps/web tailwindcss @tailwindcss/vite vite-plugin-pwa vitest @testing-library/react jsdom && npm install -w apps/web -D @types/node
```

```ts
// apps/web/test/api.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { sendChat, saveKey } from '../src/lib/api.js';

describe('api istemcisi', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('chat cevabi reply dondurur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ reply: 'selam', approvals: [] }))));
    expect(await sendChat('c1', 'selam', ['chat'])).toEqual({ reply: 'selam', approvals: [] });
  });
  it('anahtar kaydi ok doner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
    expect(await saveKey('openrouter', 'sk-x')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: FAIL gör** — Run: `npm run test -w apps/web`, Expected: FAIL (`src/lib/api.ts` yok).

- [ ] **Step 3: api.ts + PWA config yaz**

```ts
// apps/web/src/lib/api.ts
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
  const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
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
```

```ts
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'JARVIS', short_name: 'JARVIS', start_url: '/',
      display: 'standalone', background_color: '#0b0f14', theme_color: '#0b0f14',
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
  })],
  server: { proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } } },
  test: { environment: 'jsdom' },
});
```

```svg
<!-- apps/web/public/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0b0f14"/><circle cx="32" cy="32" r="18" fill="none" stroke="#38e1ff" stroke-width="3"/><circle cx="32" cy="32" r="6" fill="#38e1ff"/></svg>
```

- [ ] **Step 4: PASS + commit**

Run: `npm run test -w apps/web`
Expected: 2 test PASS.

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/index.html apps/web/src apps/web/public apps/web/test
git commit -m "feat: web iskeleti, PWA manifest, API istemcisi"
```

---

### Task 2: Sohbet sayfası (yazı + ses + onay kartları)

**Files:**
- Create: `apps/web/src/pages/Chat.tsx`
- Create: `apps/web/src/hooks/useChat.ts`
- Modify: `apps/server/src/index.ts` (voice-profil proxy: `GET/PUT /api/voice-profile/{user}` -> voice `/profile/{user}`)
- Modify: `apps/server/test/server.test.ts` (proxy testi — voice mock'la)

**Interfaces:**
- Consumes: Task 1 api.ts; Plan A `/api/chat`, `/api/stt`, `/api/tts`; Plan B `/profile`.
- Produces: Mikrofon kaydeder -> `/api/stt` -> metin -> `/api/chat` -> cevap; hoparlör `/api/tts` okur; L2 onayı kart olarak gelir (Onayla/Reddet -> `/api/approve`); çevrimdışıyken mesaj kuyruğa girer (`localStorage jarvis-kuyruk`), bağlantıda otomatik gönderilir.

- [ ] **Step 1: Failing test yaz** (kuyruk mantığı + hook)

```tsx
// apps/web/test/chat.test.tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../src/hooks/useChat.js';

describe('useChat kuyruk', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
  it('cevrimdisiyken kuyruga yazar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ag yok'); }));
    const { result } = renderHook(() => useChat('c1'));
    await act(async () => { await result.current.send('selam'); });
    expect(JSON.parse(localStorage.getItem('jarvis-kuyruk') ?? '[]')).toContain('selam');
  });
});
```

- [ ] **Step 2: FAIL gör** — Run: `npm run test -w apps/web`, Expected: FAIL.

- [ ] **Step 3: hook + sayfa yaz**

```ts
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
```

```tsx
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
```

Server voice-profil proxy (Plan A dosyasına ek):

```ts
app.get('/api/voice-profile/:user', async (req) => {
  const { user } = req.params as { user: string };
  const r = await fetch(`${VOICE()}/profile/${encodeURIComponent(user)}`);
  return r.json();
});
app.put('/api/voice-profile/:user', async (req) => {
  const { user } = req.params as { user: string };
  const r = await fetch(`${VOICE()}/profile/${encodeURIComponent(user)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
  return r.json();
});
```

- [ ] **Step 4: PASS (web + server) + kapalı rozet filtresi + commit**

`apps/server/src/index.ts` `/api/chat` içine, runTurn çağrısından önce ekle (kapalı rozet istekten düşer):

```ts
const db = settingsDb();
const kapali = new Set(
  body.badges.filter((b) => db.prepare('SELECT v FROM settings WHERE k = ?').get(`rozet_${b}`) as { v: string } | undefined)?.v === 'kapali'),
);
db.close();
const aktif = body.badges.filter((b) => !kapali.has(b));
const res = await runTurn({ text: body.text, badges: aktif.length ? aktif : ['chat'], mode: 'normal', approvals: [] }, llm);
```

Server proxy testi (`apps/server/test/server.test.ts` sonuna ekle — voice yerine yerel mock sunucu):

```ts
it('voice-profile proxy calisir', async () => {
  const { createServer } = await import('node:http');
  const mock = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ subs: {} }));
  });
  await new Promise<void>((r) => mock.listen(18765, r));
  process.env.JARVIS_VOICE_URL = 'http://localhost:18765';
  const app = await build();
  const res = await app.inject({ method: 'GET', url: '/api/voice-profile/ilkaycan' });
  mock.close();
  expect(res.statusCode).toBe(200);
});
```

Not: bu test `VOICE` sabitini `http://localhost:8765` varsayar; test sırasında gerçek voice kapalıysa proxy 500 döner — bu yüzden `apps/server/src/index.ts`'te `VOICE` değeri `process.env.JARVIS_VOICE_URL ?? 'http://localhost:8765'` olmalı (testte `JARVIS_VOICE_URL=http://localhost:18765` set edilir). Bu satırı Task 6 koduna işle.

Run: `npm run test -w apps/web && npm run test -w apps/server`
Expected: hepsi PASS.

```bash
git add apps/web/src apps/web/test apps/server
git commit -m "feat: sohbet sayfasi, ses kayit/okuma, onay kartlari, cevrimdisi kuyruk"
```

---

### Task 3: Ayarlar sayfası (kişiselleştirme + anahtarlar + rozetler + profil + tunnel)

**Files:**
- Create: `apps/web/src/pages/Settings.tsx`
- Create: `apps/web/test/settings.test.tsx`

**Interfaces:**
- Consumes: Task 1 api.ts; `/api/settings`, `/api/keys`, `/api/ollama`, `/api/tunnel`, `/api/voice-profile/{user}`.
- Produces: Tek sayfada 6 bölüm: asistan adı/uyanma/hitap/üslup/tema/TTS hızı/dil (settings key'leri: `asistan_adi, uyanma, hitap, uslup, tema, tts_hiz, dil`), sağlayıcı anahtarları (5 sağlayıcı, maskeli input), rozet aç/kapa (`rozet_<id>`), ses profili sözlüğü (satır başına `yanlis=dogru`), tunnel düğmesi, Ollama model listesi.

- [ ] **Step 1: Failing test yaz**

```tsx
// apps/web/test/settings.test.tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from '../src/pages/Settings.js';

describe('Settings', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('kaydet dugmesi ayarlari gonderir', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init?.method]);
      if (url === '/api/settings' && !init) return new Response(JSON.stringify({ asistan_adi: 'JARVIS' }));
      return new Response(JSON.stringify({ ok: true }));
    }));
    render(<Settings />);
    await waitFor(() => screen.getByLabelText('asistan adi'));
    fireEvent.click(screen.getByText('kaydet'));
    await waitFor(() => expect(calls.some(([u, m]) => u === '/api/settings' && m === 'POST')).toBe(true));
  });
});
```

- [ ] **Step 2: FAIL gör** — Run: `npm run test -w apps/web`, Expected: FAIL.

- [ ] **Step 3: Settings.tsx yaz**

```tsx
// apps/web/src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { getSettings, saveSettings, saveKey, toggleTunnel } from '../lib/api.js';

const ROZETLER = ['chat', 'ses', 'kod', 'arastirma', 'siber', 'ogretmen', 'yazar', 'planlayici'] as const;
const SAGLAYICILAR = ['gemini', 'claude', 'openai', 'grok', 'openrouter'] as const;

export default function Settings() {
  const [s, setS] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [profil, setProfil] = useState('');
  const [tunnelMsg, setTunnelMsg] = useState('');

  useEffect(() => {
    void getSettings().then(setS);
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

      <h2>api anahtarlari</h2>
      {SAGLAYICILAR.map((p) => (
        <label key={p}>{p}<input type="password" placeholder="kayitli ise bos birak"
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
```

- [ ] **Step 4: PASS + commit**

Run: `npm run test -w apps/web && npm run build -w apps/web`
Expected: testler PASS, build temiz.

```bash
git add apps/web
git commit -m "feat: ayarlar sayfasi (kisisellestirme, anahtar, rozet, profil, tunnel)"
```

---

### Task 4: CLI + systemd + skills tohumu

**Files:**
- Modify: `bin/jarvis` (tam sürüm: dev/start/stop/status/logs)
- Create: `systemd/jarvis.service`
- Create: `skills/strix-adapter/SKILL.md`
- Create: `skills/hacker-tester/SKILL.md`

**Interfaces:**
- Consumes: Plan A server (`JARVIS_SERVE=1`), Plan B voice.
- Produces: `jarvis start|dev|stop|status` çalışır; açılışta otomatik başlama; `skills/` agent-core `loadSkills` ile yüklenir (yol: repo `skills/`).

- [ ] **Step 1: CLI yaz + duman testi**

```bash
# bin/jarvis (tam surum)
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PIDDIR="$PWD/data"; mkdir -p "$PIDDIR"
case "${1:-help}" in
  dev) npm run dev ;;
  start)
    JARVIS_SERVE=1 nohup npm:start -w apps/server > data/server.log 2>&1 & echo $! > data/server.pid
    (cd apps/voice && nohup uv run uvicorn app.main:app --port 8765 > ../../data/voice.log 2>&1 & echo $! > ../../data/voice.pid)
    echo "JARVIS baslatildi (server:3000, voice:8765)" ;;
  stop) kill "$(cat data/server.pid)" 2>/dev/null; kill "$(cat data/voice.pid)" 2>/dev/null; echo durdu ;;
  status) curl -sf localhost:3000/api/health && curl -sf localhost:8765/health && echo " ikisi de ayakta" ;;
  *) echo "kullanim: jarvis {dev|start|stop|status}" ;;
esac
```

```ini
# systemd/jarvis.service
[Unit]
Description=JARVIS kisisel asistan
After=network-online.target
[Service]
Type=simple
WorkingDirectory=%h/Belgeler/Default Project/jarvis
ExecStart=%h/Belgeler/Default Project/jarvis/bin/jarvis start
ExecStop=%h/Belgeler/Default Project/jarvis/bin/jarvis stop
Restart=on-failure
[Install]
WantedBy=default.target
```

Run: `bash -n bin/jarvis && ./bin/jarvis start && sleep 8 && ./bin/jarvis status && ./bin/jarvis stop`
Expected: health JSON'ları + "ikisi de ayakta".

- [ ] **Step 2: Skill tohumları yaz**

```markdown
# skills/strix-adapter/SKILL.md
# Strix Adapter
Penetration-testing-with-strix becerisinin JARVIS karsiligi. Dry-run varsayilan.
Tools: site_scan, file_check, quarantine
```

```markdown
# skills/hacker-tester/SKILL.md
# Hacker Tester
Yalnizca testproje4 kapsami; dry-run varsayilan; sonuclar loga yazilir.
Tools: site_scan, file_check
```

Doğrula: `node -e "import('./packages/agent-core/dist/index.js')"` ile loadSkills('skills') 2 skill dönmeli (önce agent-core build gerekir — Plan A Task 5'te yapıldı).

- [ ] **Step 3: Commit**

```bash
git add bin/jarvis systemd skills
git commit -m "feat: jarvis CLI, systemd servisi, skill tohumlari"
```

---

### Task 5: GitHub push (manuel, repo ismi kullanıcıdan)

**Files:** yok (uzak depo işlemi).

- [ ] **Step 1: Repo adını kullanıcıdan al** (henüz verilmedi — bu adım bekler).
- [ ] **Step 2: Push**

```bash
git status --short   # data/ gorunmemeli (.gitignore kontrolu)
gh repo create <isim> --public --source=. --push
git log --oneline -5
```

Expected: `gh` çıktısında repo URL'si; `git log`'da tüm Faz-1 commit'leri.

## Öz-inceleme notu (yürütürken)

- Spec coverage: Bölüm 5 PWA+erişim+GitHub (Task 1,2,4,5), Bölüm 6 kişiselleştirme+skills (Task 3,4). Telegram Faz-2 prizi Plan A Task 6'da hazır — bu planda Telegram kodu YOK.
- Placeholder yok: tüm endpoint'ler Plan A/B'deki gerçek sözleşmeler.
- Tutarlılık: `rozet_<id>` settings key'leri sunucuda okunup agent-core'a badges olarak geçilir (server `/api/chat`'e ek: settings'ten kapalı rozetleri filtrele — küçük ek, Task 2'de yapılır).
