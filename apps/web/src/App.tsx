import { useState } from 'react';
import Chat from './pages/Chat.js';
import Settings from './pages/Settings.js';

export default function App() {
  const [sayfa, setSayfa] = useState<'sohbet' | 'ayarlar'>('sohbet');
  return (
    <main className="min-h-screen p-4" style={{ fontFamily: 'var(--font-display)' }}>
      <div className="reactor" aria-hidden="true">
        <div className="reactor-glow"></div>
        <div className="reactor-core-container">
          <div className="reactor-tunnel"></div>
          <div className="reactor-ring"></div>
          <div className="reactor-core"></div>
        </div>
        <div className="reactor-labels">J.A.R.V.I.S. — ONLINE</div>
      </div>
      <div className="topbar">
        <h1>J.A.R.V.I.S.</h1>
        <div className="durum-cubugu">
          <div className="durum-nokta"></div>
          <span>sistem hazir</span>
        </div>
      </div>
      <div className="sekmeler">
        <button className={sayfa === 'sohbet' ? 'sekme sekme-acik' : 'sekme'} onClick={() => setSayfa('sohbet')}>sohbet</button>
        <button className={sayfa === 'ayarlar' ? 'sekme sekme-acik' : 'sekme'} onClick={() => setSayfa('ayarlar')}>ayarlar</button>
      </div>
      <div className="panel" style={{ minHeight: '55vh', display: 'flex', flexDirection: 'column' }}>
        {sayfa === 'sohbet' ? <Chat goSettings={() => setSayfa('ayarlar')} /> : <Settings />}
      </div>
    </main>
  );
}
