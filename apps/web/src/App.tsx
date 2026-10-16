import { useState, useEffect } from 'react';

const WEATHER_CODES: Record<number, { ad: string; tr: string }> = {
  0: { ad: 'Clear sky', tr: 'Güneşli' },
  1: { ad: 'Mainly clear', tr: 'Çok az bulutlu' },
  2: { ad: 'Partly cloudy', tr: 'Az bulutlu' },
  3: { ad: 'Overcast', tr: 'Çok bulutlu' },
  45: { ad: 'Fog', tr: 'Sisli' },
  48: { ad: 'Depositing rime fog', tr: 'Dumanlı sis' },
  51: { ad: 'Light drizzle', tr: 'Hafif sisimli yağmur' },
  53: { ad: 'Moderate drizzle', tr: 'Orta düzeyde sisimli yağmur' },
  55: { ad: 'Dense drizzle', tr: 'Yoğun sisimli yağmur' },
  56: { ad: 'Light freezing drizzle', tr: 'Hafif donucu çıplak yağmur' },
  57: { ad: 'Dense freezing drizzle', tr: 'Yoğun donucu çıplak yağmur' },
  61: { ad: 'Slight rain', tr: 'Hafif yağmur' },
  63: { ad: 'Moderate rain', tr: 'Orta şiddetli yağmur' },
  65: { ad: 'Heavy rain', tr: 'Kuvvetli yağmur' },
  66: { ad: 'Light freezing rain', tr: 'Hafif donanık yağmur' },
  67: { ad: 'Heavy freezing rain', tr: 'Kuvvetli donanık yağmur' },
  71: { ad: 'Slight snow fall', tr: 'Hafif kar' },
  73: { ad: 'Moderate snow fall', tr: 'Orta şiddetli kar' },
  75: { ad: 'Heavy snow fall', tr: 'Kuvvetli kar' },
  77: { ad: 'Snow grains', tr: 'Kar taneleri' },
  80: { ad: 'Slight rain showers', tr: 'Hafif sağanak yağmur' },
  81: { ad: 'Moderate rain showers', tr: 'Orta şiddetli sağanak yağmur' },
  82: { ad: 'Violent rain showers', tr: 'Şiddetli sağanak yağmur' },
  85: { ad: 'Slight snow showers', tr: 'Hafif sağanak kar' },
  86: { ad: 'Heavy snow showers', tr: 'Kuvvetli sağanak kar' },
  95: { ad: 'Thunderstorm', tr: 'Fırtına' },
  96: { ad: 'Thunderstorm with slight hail', tr: 'Hafif dolu ile fırtına' },
  99: { ad: 'Thunderstorm with heavy hail', tr: 'Kuvvetli dolu ile fırtına' },
};

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

export default function App() {
  const [durum, setDurum] = useState<'hazir' | 'dinleniyor' | 'konusuyor' | 'hata'>('hazir');
  const [saat, setSaat] = useState('');
  const [weather, setWeather] = useState<{ sicaklik: string; durum: string; konum: string } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    const tick = () => setSaat(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) setDurum('hazir');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      setWeatherLoading(true);
      try {
        const r = await fetch('/api/weather?lat=42.8&lon=-83.7');
        if (!r.ok) throw new Error('weather service failed');
        const d = await r.json();
        if (cancelled) return;
        const cur = d.current_weather ?? d.current;
        if (cancelled) return;
        const temp = cur.temperature_2m ?? cur.temperature ?? 0;
        setWeather({
          sicaklik: `${cToF(temp)}°F`,
          durum: `${WEATHER_CODES[cur.weather_code]?.tr ?? 'Bilinmiyor'} // hissedilen ${cToF(temp + 3)}°F`,
          konum: `${d.latitude.toFixed(1)}, ${d.longitude.toFixed(1)}`,
        });
      } catch {
        if (!cancelled) setWeather({ sicaklik: '—', durum: 'hava durumu yüklenemedi', konum: '' });
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }
    fetchWeather();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="hud-app">
      <header className="hud-topbar">
        <div className="hud-brand">JARVIS</div>
        <div className="hud-sub">MK1 HUD // YEREL ÖNCELİKLİ İŞLETİM SİSTEMİ</div>
        <div className="hud-right">
          <span className="hud-chip">YEREL MOD</span>
          <span className="hud-chip">MK1 HUD</span>
          <span className="hud-saat">{saat}</span>
        </div>
      </header>

      <main className="hud-grid">
        <aside className="hud-sol">
          <section className="hud-panel">
            <div className="hud-panel-baslik">GÖREV MERKEZİ</div>
            <div className="hud-tarih">CUMA, 12 HAZİRAN 2026</div>
            <div className="hud-buyuk-saat">{saat}</div>
            <div className="hud-kucuk-yazi">Yerel komut düğümü</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">HAVA DURUMU</div>
            {weatherLoading ? <div className="hud-sicaklik">yükleniyor...</div> : weather ? (
              <>
                <div className="hud-sicaklik">{weather.sicaklik}</div>
                <div className="hud-hava-durum">{weather.durum}</div>
                <div className="hud-kucuk-yazi">{weather.konum}</div>
              </>
            ) : (
              <>
                <div className="hud-sicaklik">—</div>
                <div className="hud-hava-durum">hava durumu yok</div>
                <div className="hud-kucuk-yazi">—</div>
              </>
            )}
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">BÜGÜNÜN PLANI</div>
            <div className="hud-plan-satir">0 AÇIK</div>
            <div className="hud-kucuk-yazi">0 bugün için // 0 geçiken // 0 hatırlatıcı // 1 etkinlik</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">EYLEM ÖZETLERİ</div>
            <div className="hud-brief"><span className="hud-brief-baslik">HAZIR</span><br/><span className="hud-kucuk-yazi">Hazır yazılmış özet</span></div>
            <div className="hud-brief"><span className="hud-brief-baslik">GÜN</span><br/><span className="hud-kucuk-yazi">Bugünün çalışma bloklarını oluştur</span></div>
            <div className="hud-brief"><span className="hud-brief-baslik">ÖZET</span><br/><span className="hud-kucuk-yazi">Sıralı açık döngüler</span></div>
            <div className="hud-brief"><span className="hud-brief-baslik">AKŞAM</span><br/><span className="hud-kucuk-yazi">Döngüleri kapat ve ileriye taşı</span></div>
          </section>
        </aside>

        <section className="hud-orta">
          <div className={`reaktör ${durum !== 'hazir' ? durum : ''}`} aria-hidden="true">
            <div className="reaktör-glow"></div>
            <div className="reaktör-core-container">
              <div className={`reaktör-core ${durum !== 'hazir' ? durum : ''}`}></div>
              <div className="reaktör-tunnel"></div>
              <div className="reaktör-ring"></div>
              <div className="reaktör-dot d1"></div>
              <div className="reaktör-dot d2"></div>
              <div className="reaktör-dot d3"></div>
              <div className="reaktör-dot d4"></div>
              <div className="reaktör-dot d5"></div>
              <div className="reaktör-dot d6"></div>
              <div className="reaktör-dot d7"></div>
              <div className="reaktör-dot d8"></div>
              <div className="reaktör-dot d9"></div>
            </div>
            <div className="reaktör-status">{durum === 'dinleniyor' ? 'dinleniyor' : durum === 'konusuyor' ? 'konuşuyor' : durum === 'hata' ? 'hata' : 'hazır'}</div>
            <div className="reaktör-logo">J.A.R.V.I.S.</div>
            <div className="reaktör-alt">YEREL ZEKÂ MERKEZİ</div>
          </div>
        </section>

        <aside className="hud-sag">
          <section className="hud-panel">
            <div className="hud-panel-baslik">ETKİNLIK GÜNÜĞÜ</div>
            <div className="hud-log-satir">SYS: HUD başlatıldı.</div>
            <div className="hud-log-satir">SYS: Yerel çekirdek bekleniyor...</div>
            <div className="hud-log-satir">SYS: Mikrofon yakalama hazır. OpenAI transkripsiyon tercih ediliyor.</div>
            <div className="hud-log-satir">SYS: JARVIS yerel çekirdek çevrimiçi</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">GÜNCELLEME</div>
            <div className="hud-agenda-satir">Güncelleme — TAKVIM // 12 Haziran, 14:30</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">ONAYLAR</div>
            <div className="hud-kucuk-yazi">Bekleyen onay yok.</div>
          </section>
        </aside>
      </main>

      <footer className="hud-altbar">
        <div className="hud-metrik">
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">İŞLEMCİ</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '56%' }}></div></div>
            <span className="hud-metrik-deger">56%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">BELLEK</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '94%' }}></div></div>
            <span className="hud-metrik-deger">94%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">DİSK</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '95%' }}></div></div>
            <span className="hud-metrik-deger">95%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">ÇEKİRDEK</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '100%' }}></div></div>
            <span className="hud-metrik-deger">ÇEVRIMİÇİ</span>
          </div>
        </div>
        <div className="hud-bilgi">
          <span className="hud-kucuk-yazi">ÇALIŞMA SÜRESİ</span><span className="hud-deger">2G 12S</span>
          <span className="hud-kucuk-yazi">İŞLEM</span><span className="hud-deger">86940</span>
          <span className="hud-kucuk-yazi">İŞLETİM SİSTEMİ</span><span className="hud-deger">LINUX</span>
        </div>
        <div className="hud-komut-alani">
          <input type="text" className="hud-komut-input" placeholder="Bir komut veya soru yazın..." />
          <button className="hud-buton mikrofon" title="Konuş">KONUŞMAK İÇİN TIKLA</button>
          <button className="hud-buton vurgulu">UYANDIRMA KAPALI</button>
          <button className="hud-buton">VERİ STÜDYO</button>
          <button className="hud-buton">AYARLA</button>
        </div>
      </footer>
    </div>
  );
}
