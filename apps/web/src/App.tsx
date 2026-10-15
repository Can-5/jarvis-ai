import { useState } from 'react';
import Chat from './pages/Chat.js';
import Settings from './pages/Settings.js';

export default function App() {
  const [sayfa, setSayfa] = useState<'sohbet' | 'ayarlar'>('sohbet');
  return (
    <main className="min-h-screen bg-[#0b0f14] text-[#e8f4f8] p-4">
      <h1 className="text-2xl">JARVIS</h1>
      <nav>
        <button onClick={() => setSayfa('sohbet')}>sohbet</button>
        <button onClick={() => setSayfa('ayarlar')}>ayarlar</button>
      </nav>
      {sayfa === 'sohbet' ? <Chat /> : <Settings />}
    </main>
  );
}
