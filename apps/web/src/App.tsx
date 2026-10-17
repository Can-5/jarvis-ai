import { useState, useEffect, useRef } from 'react';
import QRCode from 'jsqr';

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
  const [qrResult, setQrResult] = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<string | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [photos, setPhotos] = useState<{ dataUrl: string; zaman: string }[]>([]);
  const [stats, setStats] = useState<{ cpu: number; memPercent: number; diskPercent: number } | null>(null);
  const [mod, setMod] = useState<'sohbet' | 'ses' | 'siber' | 'kamera' | 'tamir' | 'guvenlik'>('sohbet');
  const [komut, setKomut] = useState('');
  const [usbDevices, setUsbDevices] = useState<string>('');
  const [repairResult, setRepairResult] = useState<string>('');
  const [scanResult, setScanResult] = useState<string>('');
  const [usbSrc, setUsbSrc] = useState('');
  const [usbDst, setUsbDst] = useState('');
  const [fsDevice, setFsDevice] = useState('');
  const [fsScanPath, setFsScanPath] = useState('');
  const [guvenlikSonuc, setGuvenlikSonuc] = useState<string>('');
  const [protectionAcik, setProtectionAcik] = useState<boolean>(false);
  const [cameraWidth, setCameraWidth] = useState<number>(1280);
  const [cameraHeight, setCameraHeight] = useState<number>(720);
  const [snapshotInterval, setSnapshotInterval] = useState<number>(60);
  const [snapshotCount, setSnapshotCount] = useState<number>(10);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

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

  const listeleUsb = async () => {
    try {
      const r = await fetch('/api/usb/list');
      const d = await r.json();
      setUsbDevices(typeof d.devices === 'string' ? d.devices : JSON.stringify(d.devices));
    } catch (e) { setUsbDevices('Hata: ' + String(e)); }
  };

  const kopyalaUsb = async () => {
    try {
      const r = await fetch('/api/usb/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: usbSrc, dst: usbDst }),
      });
      const d = await r.json();
      setRepairResult(d.ok ? d.output : ('Hata: ' + d.error));
    } catch (e) { setRepairResult('Hata: ' + String(e)); }
  };

  const kontrolEtFs = async () => {
    try {
      const r = await fetch('/api/fs/check?device=' + encodeURIComponent(fsDevice));
      const d = await r.json();
      setRepairResult(d.check !== undefined ? d.check : ('Hata: ' + d.error));
    } catch (e) { setRepairResult('Hata: ' + String(e)); }
  };

  const onarFs = async () => {
    try {
      const r = await fetch('/api/fs/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: fsDevice }),
      });
      const d = await r.json();
      setRepairResult(d.repaired !== undefined ? d.repaired : ('Hata: ' + d.error));
    } catch (e) { setRepairResult('Hata: ' + String(e)); }
  };

  const taraFs = async () => {
    try {
      const r = await fetch('/api/fs/scan?path=' + encodeURIComponent(fsScanPath));
      const d = await r.json();
      setScanResult(d.scan !== undefined ? d.scan : ('Hata: ' + d.error));
    } catch (e) { setScanResult('Hata: ' + String(e)); }
  };

  const guvenlikListesi = async () => {
    try {
      const r = await fetch('/api/camera/list');
      const d = await r.json();
      setGuvenlikSonuc(typeof d.cameras === 'string' ? d.cameras : JSON.stringify(d.cameras));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const mikrofonTani = async () => {
    try {
      const r = await fetch('/api/mic/diagnose', { method: 'POST' });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.diagnose === 'string' ? d.diagnose : JSON.stringify(d.diagnose));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const mikrofonOnar = async () => {
    try {
      const r = await fetch('/api/mic/repair', { method: 'POST' });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.repaired === 'string' ? d.repaired : ('Hata: ' + d.error));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const avTara = async () => {
    try {
      const r = await fetch('/api/av/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fsScanPath }),
      });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.scan === 'string' ? d.scan : ('Hata: ' + d.error));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const avKarantina = async () => {
    try {
      const r = await fetch('/api/av/quarantine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fsScanPath }),
      });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.quarantined === 'string' ? d.quarantined : ('Hata: ' + d.error));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const avKarantinaListe = async () => {
    try {
      const r = await fetch('/api/av/quarantine-list');
      const d = await r.json();
      setGuvenlikSonuc(typeof d.quarantined === 'string' ? d.quarantined : JSON.stringify(d.quarantined));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const preScan = async () => {
    try {
      const r = await fetch('/api/pre-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fsScanPath }),
      });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.prescan === 'string' ? d.prescan : ('Hata: ' + d.error));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const protectionToggle = async () => {
    try {
      const r = await fetch('/api/protection/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: !protectionAcik }),
      });
      const d = await r.json();
      setProtectionAcik(!protectionAcik);
      setGuvenlikSonuc(typeof d.toggled === 'string' ? d.toggled : ('Koruma ' + (protectionAcik ? 'kapatildi' : 'acildi')));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const selfAnalyze = async () => {
    try {
      const r = await fetch('/api/self/analyze', { method: 'POST' });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.analysis === 'string' ? d.analysis : JSON.stringify(d.analysis));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const selfApply = async () => {
    try {
      const r = await fetch('/api/self/apply', { method: 'POST' });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.applied === 'string' ? d.applied : ('Hata: ' + d.error));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const kameraCozunurluk = async () => {
    try {
      const r = await fetch('/api/camera/resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ width: cameraWidth, height: cameraHeight }),
      });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.resolution === 'string' ? d.resolution : JSON.stringify(d));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const zamanliSnapshot = async () => {
    try {
      const r = await fetch('/api/camera/snapshot-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalSeconds: snapshotInterval, count: snapshotCount }),
      });
      const d = await r.json();
      setGuvenlikSonuc(typeof d.scheduled === 'string' ? d.scheduled : JSON.stringify(d));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  const protectionDurum = async () => {
    try {
      const r = await fetch('/api/protection/status');
      const d = await r.json();
      setGuvenlikSonuc(typeof d.status === 'string' ? d.status : JSON.stringify(d.status));
    } catch (e) { setGuvenlikSonuc('Hata: ' + String(e)); }
  };

  useEffect(() => {
    let cancelled = false;
    async function pollStats() {
      try {
        const r = await fetch('/api/system-stats');
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setStats({ cpu: d.cpu, memPercent: d.memPercent, diskPercent: d.diskPercent });
      } catch {}
    }
    pollStats();
    const t = setInterval(pollStats, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = videoRef.current;
      if (video) video.srcObject = stream;
      setCameraActive(true);
      setQrResult(null);
    } catch (err) {
      console.error('Kamera erişilemedi:', err);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current!.srcObject = null;
    }
    setCameraActive(false);
    cancelAnimationFrame(rafRef.current);
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraActive) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = QRCode(imageData.data, imageData.width, imageData.height);
    if (code) {
      stopCamera();
      setQrResult(code.data);
      fetch('/api/lada/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrData: code.data }),
      }).catch(() => {});
    } else {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
  };

  const captureFrameForVision = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setVisionLoading(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conv: 'kamera',
          text: 'Bu gorselde neler goruyorsun? Turkce acikla.',
          vision: true,
          imageUrl: dataUrl,
        }),
      });
      if (!r.ok) throw new Error(`sunucu hatasi ${r.status}`);
      const json = await r.json();
      setVisionResult(json.reply || 'analiz yapilamadi');
    } catch (err) {
      setVisionResult('gorsel analiz hatasi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setVisionLoading(false);
    }
  };

  const handleKomut = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const k = komut.toLowerCase().replace(/[.,!?]/g, '').trim();
    if (k.includes('kamera aç') || k.includes('kamerayı aç') || k.includes('kamera açar')) {
      setMod('kamera');
      startCamera();
    } else if (k.includes('ses aç') || k.includes('sesli mod')) {
      setMod('ses');
    }     else if (k.includes('siber mod')) {
      setMod('siber');
    } else if (k.includes('guvenlik modu') || k.includes('guvenlik')) {
      setMod('guvenlik');
    } else if (k.includes('koruma ac') || k.includes('korumayı ac')) {
      setMod('guvenlik');
      fetch('/api/protection/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: true }) });
    } else if (k.includes('koruma kapat') || k.includes('korumayı kapat')) {
      setMod('guvenlik');
      fetch('/api/protection/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: false }) });
    } else if (k.includes('mikrofon onar') || k.includes('mikrofonu onar')) {
      setMod('guvenlik');
      fetch('/api/mic/repair', { method: 'POST' });
    } else if (k.includes('kamera liste') || k.includes('kameraları listele')) {
      setMod('guvenlik');
      fetch('/api/camera/list');
    } else if (k.includes('antivirus tara') || k.includes('virüs tara')) {
      setMod('guvenlik');
      fetch('/api/av/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fsScanPath || '/' }) });
    } else if (k.includes('sohbet')) {
      setMod('sohbet');
    }
    setKomut('');
  };

  const sesKayit = () => {
    fetch('/api/voice/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'kullanici' }) });
  };

  const sesDogruLa = () => {
    fetch('/api/voice/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'kullanici' }) });
  };

  const spoofTespit = () => {
    fetch('/api/voice/spoof-check', { method: 'POST' });
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const zaman = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setPhotos((prev) => [{ dataUrl, zaman }, ...prev].slice(0, 20));
    const link = document.createElement('a');
    link.download = `jarvis-foto-${zaman.replace(/:/g, '-')}.jpg`;
    link.href = dataUrl;
    link.click();
  };

  useEffect(() => {
    if (cameraActive) {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraActive]);

  return (
    <div className="hud-app">
      <header className="hud-topbar">
        <div className="hud-brand">JARVIS</div>
        <div className="hud-sub">MK1 HUD // YEREL ÖNCELİKLİ İŞLETİM SİSTEMİ</div>
        <div className="hud-right">
          <span className="hud-chip">YEREL MOD</span>
          <span className="hud-chip">MK1 HUD</span>
          <span className="hud-saat">{saat}</span>
          <div className="mod-secici-kucuk">
            <button className={`mod-buton-kucuk ${mod === 'sohbet' ? 'aktif' : ''}`} onClick={() => setMod('sohbet')}>💬</button>
            <button className={`mod-buton-kucuk ${mod === 'ses' ? 'aktif' : ''}`} onClick={() => setMod('ses')}>🎤</button>
            <button className={`mod-buton-kucuk ${mod === 'siber' ? 'aktif' : ''}`} onClick={() => setMod('siber')}>🛡️</button>
            <button className={`mod-buton-kucuk ${mod === 'kamera' ? 'aktif' : ''}`} onClick={() => setMod('kamera')}>📷</button>
            <button className={`mod-buton-kucuk ${mod === 'tamir' ? 'aktif' : ''}`} onClick={() => setMod('tamir')}>🔧</button>
            <button className={`mod-buton-kucuk ${mod === 'guvenlik' ? 'aktif' : ''}`} onClick={() => setMod('guvenlik')}>🛡️</button>
          </div>
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
          <section className="hud-panel">
            <div className="hud-panel-baslik">MOD SEÇİCİ</div>
            <div className="mod-secici">
              <button className={`mod-buton ${mod === 'sohbet' ? 'aktif' : ''}`} onClick={() => setMod('sohbet')}>💬 SOHBET</button>
              <button className={`mod-buton ${mod === 'ses' ? 'aktif' : ''}`} onClick={() => setMod('ses')}>🎤 SES</button>
              <button className={`mod-buton ${mod === 'siber' ? 'aktif' : ''}`} onClick={() => setMod('siber')}>🛡️ SİBER</button>
              <button className={`mod-buton ${mod === 'kamera' ? 'aktif' : ''}`} onClick={() => { setMod('kamera'); startCamera(); }}>📷 KAMERA</button>
              <button className={`mod-buton ${mod === 'tamir' ? 'aktif' : ''}`} onClick={() => setMod('tamir')}>🔧 TAMIR</button>
              <button className={`mod-buton ${mod === 'guvenlik' ? 'aktif' : ''}`} onClick={() => setMod('guvenlik')}>🛡️ GÜVENLİK</button>
            </div>
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
          {mod === 'tamir' ? (
            <section className="hud-panel">
              <div className="hud-panel-baslik">SISTEM TAMIR</div>
              <div className="hud-kucuk-yazi">USB Cihazlari</div>
              <button className="hud-buton" onClick={listeleUsb}>Cihazlari Listele</button>
              {usbDevices && <div className="hud-kucuk-yazi" style={{ whiteSpace: 'pre-wrap' }}>{usbDevices}</div>}
              <div className="hud-kucuk-yazi">Dosya Kopyala (USB'ye)</div>
              <input className="hud-komut-input" placeholder="Kaynak dosya" value={usbSrc} onChange={(e) => setUsbSrc(e.target.value)} />
              <input className="hud-komut-input" placeholder="Hedef USB yolu" value={usbDst} onChange={(e) => setUsbDst(e.target.value)} />
              <button className="hud-buton vurgulu" onClick={kopyalaUsb}>Kopyala</button>
              <div className="hud-kucuk-yazi">Dosya Sistemi Kontrol ve Onar</div>
              <input className="hud-komut-input" placeholder="Aygit (orn: /dev/sdb1)" value={fsDevice} onChange={(e) => setFsDevice(e.target.value)} />
              <button className="hud-buton" onClick={kontrolEtFs}>Kontrol Et</button>
              <button className="hud-buton vurgulu" onClick={onarFs}>Onar (fsck -y)</button>
              {repairResult && <div className="hud-kucuk-yazi">{repairResult}</div>}
              <div className="hud-kucuk-yazi">Bozuk Dosya Tara</div>
              <input className="hud-komut-input" placeholder="Tarama dizini" value={fsScanPath} onChange={(e) => setFsScanPath(e.target.value)} />
              <button className="hud-buton" onClick={taraFs}>Tara</button>
              {scanResult && <div className="hud-kucuk-yazi">{scanResult}</div>}
            </section>
          ) : (
            <>
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
            </>
          )}
        {mod === 'guvenlik' ? (
          <section className="hud-panel">
            <div className="hud-panel-baslik">GÜVENLİK MODU</div>
            <div className="hud-kucuk-yazi">Kamera ve Mikrofon</div>
            <button className="hud-buton" onClick={guvenlikListesi}>Kamera Listesi</button>
            <button className="hud-buton vurgulu" onClick={mikrofonTani}>Mikrofon Tanıla</button>
            <button className="hud-buton vurgulu" onClick={mikrofonOnar}>Mikrofon Onar</button>
            <div className="hud-kucuk-yazi">Antivirüs</div>
            <button className="hud-buton" onClick={avTara}>Tarama Başlat</button>
            <button className="hud-buton" onClick={preScan}>Yükleme Öncesi Tara</button>
            <button className="hud-buton" onClick={avKarantina}>Karantinaya Al</button>
            <button className="hud-buton" onClick={avKarantinaListe}>Karantina Liste</button>
            <div className="hud-kucuk-yazi">Koruma Modu</div>
            <button className="hud-buton vurgulu" onClick={protectionDurum}>Durum</button>
            <button className="hud-buton vurgulu" onClick={protectionToggle}>
              {protectionAcik ? 'Korumayı Kapat' : 'Korumayı Aç'}
            </button>
            <div className="hud-kucuk-yazi">Ses Güvenliği</div>
            <button className="hud-buton" onClick={sesKayit}>Ses Kaydı (Enroll)</button>
            <button className="hud-buton" onClick={sesDogruLa}>Ses Doğrula</button>
            <button className="hud-buton" onClick={spoofTespit}>Spoofing Tespit</button>
            <div className="hud-kucuk-yazi">Kamera Ayarları</div>
            <input className="hud-komut-input" placeholder="Genişlik (px)" value={cameraWidth} onChange={(e) => setCameraWidth(Number(e.target.value))} />
            <input className="hud-komut-input" placeholder="Yükseklik (px)" value={cameraHeight} onChange={(e) => setCameraHeight(Number(e.target.value))} />
            <button className="hud-buton" onClick={kameraCozunurluk}>Çözünürlük Ayarla</button>
            <div className="hud-kucuk-yazi">Zamanlanmış Snapshot</div>
            <input className="hud-komut-input" placeholder="Aralık (saniye)" value={snapshotInterval} onChange={(e) => setSnapshotInterval(Number(e.target.value))} />
            <input className="hud-komut-input" placeholder="Adet" value={snapshotCount} onChange={(e) => setSnapshotCount(Number(e.target.value))} />
            <button className="hud-buton" onClick={zamanliSnapshot}>Zamanla</button>
            <div className="hud-kucuk-yazi">Self-İyileştirme</div>
            <button className="hud-buton" onClick={selfAnalyze}>Kodu Analiz Et</button>
            <button className="hud-buton vurgulu" onClick={selfApply}>Güvenli Düzeltmeleri Uygula</button>
            {guvenlikSonuc && <div className="hud-kucuk-yazi" style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{guvenlikSonuc}</div>}
          </section>
        ) : null}
        </aside>
      </main>

      <footer className="hud-altbar">
        <div className="hud-metrik">
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">İŞLEMCİ</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: `${stats?.cpu ?? 0}%` }}></div></div>
            <span className="hud-metrik-deger">{stats?.cpu ?? 0}%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">BELLEK</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: `${stats?.memPercent ?? 0}%` }}></div></div>
            <span className="hud-metrik-deger">{stats?.memPercent ?? 0}%</span>
          </div>
          <div className="hud-metrik-blok">
            <span className="hud-metrik-label">DİSK</span>
            <div className="hud-progres"><div className="hud-progres-dolu" style={{ width: `${stats?.diskPercent ?? 0}%` }}></div></div>
            <span className="hud-metrik-deger">{stats?.diskPercent ?? 0}%</span>
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
          <input
            type="text"
            className="hud-komut-input"
            placeholder="Komut yazın... (ör: 'kamera aç', 'koruma aç', 'mikrofon onar', 'antivirüs tara')"
            value={komut}
            onChange={(e) => setKomut(e.target.value)}
            onKeyDown={handleKomut}
          />
          <button className="hud-buton mikrofon" title="Konuş">KONUŞMAK İÇİN TIKLA</button>
          <button className="hud-buton vurgulu">UYANDIRMA KAPALI</button>
          <button className="hud-buton">VERİ STÜDYO</button>
          <button className="hud-buton">AYARLA</button>
        </div>
      </footer>

      {cameraActive && (
        <div className="kamera-overlay">
          <video className="kamera-video" autoPlay playsInline ref={videoRef}></video>
          <canvas className="kamera-video" ref={canvasRef} style={{ display: 'none' }}></canvas>
          <div className="kamera-kontrol">
            <button className="kamera-baslat" onClick={capturePhoto}>FOTOĞRAF ÇEK</button>
            <button className="kamera-baslat" onClick={captureFrameForVision}>GÖRÜNTÜYÜ ANALİZ ET</button>
            <button className="kamera-kapat" onClick={stopCamera}>KAMERAYI KAPAT</button>
          </div>
          {visionLoading && <div className="kamera-sonuc">görüntü analiz ediliyor...</div>}
          {visionResult && (
            <div className="kamera-sonuc">
              <div className="hud-panel-baslik">GÖRÜNTÜ ANALİZİ</div>
              <div className="hud-kucuk-yazi">{visionResult}</div>
            </div>
          )}
          {qrResult && (
            <div className="kamera-sonuc">
              <div className="hud-panel-baslik">QR KOD SONUÇ</div>
              <div className="hud-kucuk-yazi">{qrResult}</div>
            </div>
          )}
          {photos.length > 0 && (
            <div className="kamera-galeri">
              <div className="hud-panel-baslik">FOTOĞRAF GALERİSİ</div>
              <div className="galeri-izgara">
                {photos.map((p, i) => (
                  <div key={i} className="galeri-kare">
                    <img src={p.dataUrl} alt="fotoğraf" />
                    <div className="galeri-zaman">{p.zaman}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
