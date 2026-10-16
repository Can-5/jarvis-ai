import { useState } from 'react';
import Chat from './pages/Chat.js';
import Settings from './pages/Settings.js';

export default function App() {
  const [sayfa, setSayfa] = useState<'sohbet' | 'ayarlar'>('sohbet');
  return (
    <main className="min-h-screen bg-[#04070a] text-[#e8f4f8] p-4">
      <div className="reactor" aria-hidden="true">
        <div className="reactor-tunnel"></div>
        <div className="reactor-ring"></div>
        <div className="reactor-core"></div>
      </div>
      <div className="top-bar">
        <h1 className="jv-title">JARVIS</h1>
        <span className="status-chip">sistem hazir</span>
      </div>
      <nav className="hud-panel" style={{ padding: '0.6rem 1rem', marginBottom: '1.5rem', display: 'inline-block' }}>
        <button className={sayfa === 'sohbet' ? 'sekme sekme-acik' : 'sekme'} onClick={() => setSayfa('sohbet')}>sohbet</button>
        <button className={sayfa === 'ayarlar' ? 'sekme sekme-acik' : 'sekme'} onClick={() => setSayfa('ayarlar')}>ayarlar</button>
      </nav>
      <div className="hud-panel" style={{ padding: '1.2rem', minHeight: '55vh' }}>
        {sayfa === 'sohbet' ? <Chat goSettings={() => setSayfa('ayarlar')} /> : <Settings />}
      </div>
    </main>
  );
}
