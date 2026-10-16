import { useState, useEffect } from 'react';
import Chat from './pages/Chat.js';
import Settings from './pages/Settings.js';

export default function App() {
  const [sayfa, setSayfa] = useState<'sohbet' | 'ayarlar'>('sohbet');
  const [durum, setDurum] = useState<'hazir' | 'dinleniyor' | 'konusuyor' | 'hata'>('hazir');

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) setDurum('hazir');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <main className="min-h-screen p-4" style={{ fontFamily: 'var(--font-display)', display: 'grid', gridTemplateColumns: '420px 1fr', gap: '2rem' }}>
      <div className="sol-panel">
        <div className={`reactor ${durum !== 'hazir' ? durum : ''}`} aria-hidden="true">
          <div className="reactor-glow"></div>
          <div className="reactor-core-container">
            <div className={`reactor-core ${durum !== 'hazir' ? durum : ''}`}></div>
            <div className="reactor-tunnel"></div>
            <div className="reactor-ring"></div>
          </div>
          <div className="reactor-status">{durum === 'dinleniyor' ? 'dinleniyor' : durum === 'konusuyor' ? 'konusuyor' : durum === 'hata' ? 'hata' : 'hazir'}</div>
          <div className="reactor-labels">J.A.R.V.I.S. — ONLINE</div>
        </div>
        <div className="durum-cubugu">
          <div className={`durum-nokta ${durum === 'dinleniyor' || durum === 'konusuyor' ? 'dinleniyor' : durum === 'hata' ? 'hata' : ''}`}></div>
          <span>{durum === 'dinleniyor' ? 'dinleniyor' : durum === 'konusuyor' ? 'konusuyor' : durum === 'hata' ? 'hata' : 'sistem hazir'}</span>
        </div>
        <div className="jarvis-baslik">
          <h1>J.A.R.V.İ.S</h1>
          <div className="jarvis-alt-yazi">Just A Rather Very Intelligent System</div>
        </div>
      </div>
      <div className="sag-panel">
        <div className="topbar">
          <div className="durum-cubugu">
            <div className={`durum-nokta ${durum === 'dinleniyor' || durum === 'konusuyor' ? 'dinleniyor' : durum === 'hata' ? 'hata' : ''}`}></div>
            <span>{durum === 'dinleniyor' ? 'dinleniyor' : durum === 'konusuyor' ? 'konusuyor' : durum === 'hata' ? 'hata' : 'sistem hazir'}</span>
          </div>
        </div>
        <div className="sekmeler">
          <button className={sayfa === 'sohbet' ? 'sekme sekme-acik' : 'sekme'} onClick={() => setSayfa('sohbet')}>sohbet</button>
          <button className={sayfa === 'ayarlar' ? 'sekme sekme-acik' : 'sekme'} onClick={() => setSayfa('ayarlar')}>ayarlar</button>
        </div>
        <div className="panel flex-1 flex flex-col" style={{ minHeight: '55vh' }}>
          {sayfa === 'sohbet' ? <Chat goSettings={() => setSayfa('ayarlar')} setDurum={setDurum} /> : <Settings />}
        </div>
      </div>
    </main>
  );
}
