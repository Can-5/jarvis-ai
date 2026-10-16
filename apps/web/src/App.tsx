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
        <div className="hud-sub">MK1 HUD // LOCAL-FIRST OPERATING SYSTEM</div>
        <div className="hud-right">
          <span className="hud-chip">LOCAL MODE</span>
          <span className="hud-chip">MKI HUD</span>
          <span className="hud-saat">{saat}</span>
        </div>
      </header>

      <main className="hud-grid">
        <aside className="hud-sol">
          <section className="hud-panel">
            <div className="hud-panel-baslik">MISSION CONTROL</div>
            <div className="hud-tarih">FRI, JUN 12, 2026</div>
            <div className="hud-buyuk-saat">{saat}</div>
            <div className="hud-kucuk-yazi">Local command node</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">WEATHER</div>
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
            <div className="hud-panel-baslik">TODAY'S PLAN</div>
            <div className="hud-plan-satir">0 OPEN</div>
            <div className="hud-kucuk-yazi">0 due today // 0 overdue // 0 reminders // 1 events</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">ACTION BRIEFS</div>
            <div className="hud-brief"><span className="hud-brief-baslik">READY</span><br/><span className="hud-kucuk-yazi">Prepared written briefing</span></div>
            <div className="hud-brief"><span className="hud-brief-baslik">DAY</span><br/><span className="hud-kucuk-yazi">Build today's work blocks</span></div>
            <div className="hud-brief"><span className="hud-brief-baslik">BRIEF</span><br/><span className="hud-kucuk-yazi">Ranked open loops</span></div>
            <div className="hud-brief"><span className="hud-brief-baslik">EVENING</span><br/><span className="hud-kucuk-yazi">Close loops and carry forward</span></div>
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
            </div>
            <div className="reaktör-status">{durum === 'dinleniyor' ? 'dinleniyor' : durum === 'konusuyor' ? 'konusuyor' : durum === 'hata' ? 'hata' : 'hazir'}</div>
            <div className="reaktör-logo">J.A.R.V.I.S.</div>
            <div className="reaktör-alt">LOCAL INTELLIGENCE CORE</div>
          </div>
        </section>

        <aside className="hud-sag">
          <section className="hud-panel">
            <div className="hud-panel-baslik">ACTIVITY LOG</div>
            <div className="hud-log-satir">SYS: HUD initialized.</div>
            <div className="hud-log-satir">SYS: Waiting for local core...</div>
            <div className="hud-log-satir">SYS: Microphone capture ready. OpenAI transcription is preferred.</div>
            <div className="hud-log-satir">SYS: JARVIS local core online</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">AGENDA</div>
            <div className="hud-agenda-satir">Sync Up — CALENDAR // Jun 12, 2:30 PM</div>
          </section>
          <section className="hud-panel">
            <div className="hud-panel-baslik">APPROVALS</div>
            <div className="hud-kucuk-yazi">No pending approvals.</div>
          </section>
        </aside>
      </main>

      <footer className="hud-altbar">
        <div className="hud-metrik">
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">CPU</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '56%' }}></div></div>
            <span className="hud-metrik-deger">56%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">MEMORY</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '94%' }}></div></div>
            <span className="hud-metrik-deger">94%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">DISK</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '95%' }}></div></div>
            <span className="hud-metrik-deger">95%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">CORE</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: '100%' }}></div></div>
            <span className="hud-metrik-deger">ONLINE</span>
          </div>
        </div>
        <div className="hud-bilgi">
          <span className="hud-kucuk-yazi">UPTIME</span><span className="hud-deger">2D 12H</span>
          <span className="hud-kucuk-yazi">PROCESS</span><span className="hud-deger">86940</span>
          <span className="hud-kucuk-yazi">OS</span><span className="hud-deger">WIN</span>
        </div>
        <div className="hud-komut-alani">
          <input
            type="text"
            className="hud-komut-input"
            placeholder="Type a command or question..."
          />
          <button className="hud-buton mikrofon" title="Konuş">CLICK TO SPEAK</button>
          <button className="hud-buton vurgulu">WAKE OFF</button>
          <button className="hud-buton">DATA STUDIO</button>
          <button className="hud-buton">CONFIGURE</button>
        </div>
      </footer>
    </div>
  );
}
