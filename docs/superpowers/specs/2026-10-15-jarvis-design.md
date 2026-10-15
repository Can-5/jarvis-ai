# JARVIS — Tasarım Dokümanı

Tarih: 2026-10-15 | Durum: Tasarım onaylı (5/5 bölüm), implementasyon bekleniyor
Sahip: ilkaycan | Ortam: Fedora KDE Plasma 44 (Wayland), RTX3060, Node 22, Python 3.14, uv

## 1. Amaç ve Kapsam

Türkçe konuşan (peltek konuşma dahil) bir JARVIS benzeri kişisel asistan:
kod yazar, doğal sohbet eder, kod çalıştırır, bilgisayarı kontrol eder
(shell + tam GUI), sesli ve yazılı giriş/çıkış yapar. Web (PWA) arayüzü ve
Faz-2'de Telegram botu ile mobil dahil her yerden erişilir. Kullanıcı
istersekendi Gemini / Claude / ChatGPT / Grok API anahtarını ekler;
anahtarsız da yerel modelle çalışır. Sonuç GitHub'a push'lanır.

Kapsam dışı (Faz-1): Telegram botu (Faz-2, priz hazır olacak).

## 2. Netleşen Kararlar (kullanıcı onaylı)

1. **Hosting:** Bilgisayarda hep açık yerel sunucu. Kod çalıştırma + ekran
   kontrolü tam güç. (Bilgisayar açık olmalı.)
2. **Modlar — birleşebilir rozetler (birbirini kilitlemez):** Normal/Chat,
   Sesli, Kod, Araştırma, Siber Güvenlik. + Güvenlik kademesi:
   salt-okur → onaylı → otonom.
3. **STT hibrit:** Varsayılan yerel Whisper, ayarlardan tek tıkla bulut
   STT. Üstüne LLM tabanlı harf-düzeltme + kişisel ses profili
   (p, ç, ş, s, c, j, y karıştıranları anlama).
4. **LLM hibrit (anahtarsız çalışma):** Ollama erişilebilirse yerel model
   (qwen3-coder vb.), yoksa ilk açılışta API anahtarı ister. 4 sağlayıcı:
   Gemini, Claude, ChatGPT, Grok (ayarlardan aç/kapat).
5. **Güvenlik:** Katmanlı + çalışma alanı sınırı + saniyelik yedek/geri
   yükleme. Çalışma alanı bir git deposudur; her değişiklik öncesi otomatik
   snapshot, tek tıkla rollback. Okuma serbest; yazma/komut onaylı;
   tehlikeli işlemler (silme, sudo, disk, ağ) her sefer sorar.
6. **Erişim:** LAN varsayılan + ayarlardan isteğe bağlı Cloudflare Tunnel
   (ücretsiz, tek tık, https). Telegram botu NAT arkasında da çalışır.
7. **Bilgisayar kontrolü:** Tam GUI (ekran + fare + klavye) + aynı onay
   kademelerine tabi. `linux-control` becerisi (ydotool + spectacle +
   AT-SPI) kullanılacak.

## 3. Mimari Yaklaşım — C: Hibrit (SEÇİLDİ)

Ajan katmanı TypeScript'te (modlar, tool'lar, güvenlik, sohbet), ses servisi
izole Python microservice (Whisper STT + TTS, GPU). Gerekçe: peltek Türkçe
Python'da en iyi çözülür, ajan mantığı TS'te tip güvenli; ses servisi
çökse chat/kod modu çalışmaya devam eder.

- Elenen A (Python-first): ajan orkestrasyonu ve tip güvenliği zayıf.
- Elenen B (Node-first): ses/ML tarafı kırılgan olurdu.

## 4. Bölüm 1 — Tech Stack ve İskelet (ONAYLI)

- **Ajan çekirdeği:** TypeScript + Node 22, Fastify (HTTP + WebSocket API).
- **Ses servisi:** Python 3.12+ (uv), FastAPI, faster-whisper (CTranslate2,
  RTX3060), TTS. İzole süreç, port 8765.
- **Web:** React + Vite + TailwindCSS, PWA (mobil ana ekrana eklenir).
  `apple-design` + `frontend-design` uygulanacak.
- **Veri:** SQLite (better-sqlite3). API anahtarları `data/` altında şifreli,
  `.gitignore` ile git dışı.
- **Yedek:** çalışma alanı git deposu, otomatik snapshot + rollback.
- **GUI:** ydotool + spectacle + AT-SPI.

Monorepo `jarvis/`:

```text
jarvis/
  apps/server   # TS ajan, API, WS, Telegram botu (Faz-2 BotAdapter prizi)
  apps/voice    # Python ses servisi :8765
  apps/web      # React PWA
  packages/agent-core | llm | tools | guard | shared
  data/         # gitignore (anahtarlar, DB, ses profilleri)
  docs/superpowers/specs/  # bu dosya
```

Veri akışı: mikrofon (PWA/yerel; Telegram Faz-2) → faster-whisper ham
metin → guard (konuşan kim + ses profili) → LLM harf-düzeltme (ham + son
3 mesaj) → agent-core (rozetler + kademe) → LLM sağlayıcı (tool-call) →
guard kademe kontrolü/onay → tools → sonuç LLM'e → TTS + yazılı cevap.

Çalıştırma: `jarvis start` (hepsi), `jarvis dev` (hot reload), systemd user
servisi (açılışta otomatik).

## 5. Bölüm 2 — Modlar ve Güvenlik Kademeleri (ONAYLI)

Rozetler aynı anda birlikte çalışır, kilitlenme yok (chat'teyken ses,
ses'teyken kod+chat vb.):

- **Chat:** normal sohbet. **Ses:** mikrofon + hoparlör. **Kod:** yazma,
  çalıştırma, dosya işlemleri. **Araştırma:** web/docs tarama.
- **Siber:** `penetration-testing-with-strix` + `hacker-tester`
  skill'lerine bağlı; dry-run default + log zorunlu. Ek kapsam:
  (1) web oluşturma güvenliği — üretilen site/kod yayına geçmeden otomatik
  tarama (tehlikeli pattern, secret sızıntısı, güvensiz header/kod, OWASP
  temel kontrolleri); (2) virüs/kötü dosya kontrolü — indirilen/üretilen
  dosyalar hash+imza kontrolü, şüpheli karantina + rapor.
- **Ek rozetler (spec sonrası, kullanıcı onaylı):** Öğretmen 📚 (basit
  anlatım, örnekle öğretir), Yazar ✍️ (yaratıcı yazı, düzeltme, üslup),
  Planlayıcı 🗓️ (hatırlatıcı, not, günlük özet).
- Rozetler ayarlardan aç/kapatılır; mimari yeni rozet eklemeye açıktır
  (rozet = system prompt + tool seti + opsiyonel model override).

Kademeler (her tool'un kademe etiketi olur): L1 salt-okur otomatik,
L2 yazma/komut onaylı, L3 otonom (kullanıcı açmadıkça kapalı), tehlikeli
işlemler her kademede sorar.

## 6. Bölüm 3 — Ses ve Peltek Anlama (ONAYLI)

`apps/voice` izole Python :8765 (çökerse chat/kod devam eder). STT hibrit:
varsayılan yerel faster-whisper (RTX3060), ayarlardan tek tık bulut STT,
aynı prize takılı failover. Ham metin direkt ajana gitmez — peltek
düzeltme katmanı: ses profili + son 3 mesaj bağlamı + kişisel sözlük +
küçük LLM dokunuşu. Cevap hem yazılı hem TTS ile sesli. Faz-1 mikrofon
kaynakları: PWA + yerel mikrofon (Telegram sesli mesajları Faz-2'de aynı
boruya, priz hazır).

## 7. Bölüm 4 — LLM ve Güvenlik ve Bilgisayar Kontrolü (ONAYLI)

Ollama varsa yerel model, yoksa ilk açılışta anahtar ister. 4 sağlayıcı
ayarlardan aç/kapat; anahtarlar `data/`da şifreli, git'e gitmez.
**5. yol — OpenRouter (spec sonrası, kullanıcı onaylı):** opencode'da
kullanılan modeller (muse-spark, nemotron serisi, minimax/step,
space-bunny, big-pickle vb.) OpenRouter API anahtarı ile JARVIS'te de
kullanılır. Ayarlardan sağlayıcı + serbest model ID seçilir (liste +
manuel yazma); global varsayılan + rozet başına opsiyonel override.
Not: ücretsiz (`:free`) modellerde rate-limit olabilir, arayüzde gösterilir.
Çalışma alanı git deposu, her değişiklik öncesi otomatik snapshot + tek
tıkla rollback. Okuma serbest, yazma/komut onaylı, tehlikeliler her sefer
sorar. Ekran+fare+klavye tam ama aynı onay kademesine bağlı — kafasına
göre tıklamaz.

## 8. Bölüm 5 — PWA ve Erişim ve GitHub (ONAYLI)
PWA site gibi açılır, ana ekrana simge eklenir, mikrofon + bildirim
çalışır, çevrimdışı açılır, bağlantı gelince senkron olur. Telegram Faz-2
bu yapının üstüne prizden takılacak. Erişim: evde aynı Wi-Fi (LAN),
dışarıdaysa ayarlardan tek dokunuşla Cloudflare Tunnel (`https`).
GitHub: `git init` + ilk commit'ler, `gh` ile `Can-5` hesabında repo açıp
push. API anahtarlı `data/` klasörü `.gitignore` ile git dışı.

## 9. Bölüm 6 — Kişiselleştirme ve Skill Sistemi (spec sonrası ek, ONAYLI)

**Kişiselleştirme (Ayarlar sayfası):** asistan adı + uyanma sözü ("JARVIS"
varsayılan, değiştirilebilir), sana nasıl hitap etsin (isim/lakap),
üslup presetleri (samimi / resmi / kısa-öz / detaycı), tema (açık/koyu),
TTS sesi + konuşma hızı, dil (Türkçe varsayılan), kullanıcı profili
(tercihler, ilgi alanları — cevapları kişiselleştirir, ses profiliyle
bağlantılı). Profil verisi `data/`da, git'e gitmez.

**Skill sistemi (kurulabilir yetenekler):** `skills/` klasörü; her skill
bir klasör + `SKILL.md` (ad, açıklama, sağladığı tool/komutlar).
agent-core skill'i tool olarak yükler, ayarlardan aç/kapatılır.
Skill'in tool'ları da L1/L2/L3 kademe etiketine tabidir (güvenlik dışı
değil). Faz-1'de kurulum = klasörü kopyala + ayarlardan aç; URL/galeri
ile tek tık kurulum Faz-2+ adayı.

## 10. Faz Planı

- **Faz-1:** çekirdek (ajan + ses + PWA + LAN + snapshot güvenliği),
  `apps/server` içinde sonradan takılacak `BotAdapter` prizi, mobil erişim
  PWA (tarayıcı) ile.
- **Faz-2 (çekirdek bitince):** Telegram botu prize takılır (metin + sesli
  mesaj aynı boruya).

## 11. Açık Noktalar

- GitHub repo ismini kullanıcı söyleyecek (push zamanı).
- Yerel model seçimi (Ollama + qwen3-coder vb.) implementasyonda netleşir.
- Bulut STT/TTS sağlayıcı seçimi implementasyonda netleşir.

## 12. Öz-inceleme (spec self-review)

- Placeholder yok (sürüm numaraları "vb." ile esnek bırakıldı, bilinçli).
- Çelişki yok: Telegram Faz-2 / PWA Faz-1 her bölümde tutarlı; `data/`
  hem Bölüm 1 hem 4 hem 5'te git dışı — tutarlı.
- Belirsizlikler Bölüm 10'da listelendi, hiçbiri tasarımı bloke etmiyor.
