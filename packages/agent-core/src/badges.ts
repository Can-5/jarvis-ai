// packages/agent-core/src/badges.ts
import type { BadgeId } from '@jarvis/shared';

export interface BadgeDef { prompt: string; tools: string[]; model?: string; }

export const BADGES: Record<BadgeId, BadgeDef> = {
  chat: { prompt: 'Sen JARVIS, samimi Turkce kisisel asistansin. Kısa ve dogal konus.', tools: [] },
  ses: { prompt: 'Sesli konusma modundasin. Cevaplarin yuksek sesle okunacak: kisa cumleler kur.', tools: [] },
  kod: { prompt: 'Kod asistani modundasin. Once mevcut dosyalari oku, degisikligi acikla, sonra yaz.', tools: ['fs_read', 'fs_write', 'shell'] },
  arastirma: { prompt: 'Arastirma modundasin. web_fetch ile kaynaga git, ozetle, link ver.', tools: ['web_fetch', 'fs_write'] },
  siber: { prompt: 'Siber guvenlik modundasin. DRY-RUN varsayilan: once ne yapacagini yaz, onay al. site_scan ve file_check kullan.', tools: ['site_scan', 'file_check', 'quarantine', 'fs_read'] },
  ogretmen: { prompt: 'Ogretmen modundasin. Basit anlat, ornek ver, sonunda kucuk soru sor.', tools: [] },
  yazar: { prompt: 'Yazar modundasin. Duisgun Turkce, akici uslup, imla duzelt.', tools: ['fs_write'] },
  planlayici: { prompt: 'Planlayici modundasin. Hatirlatici ve notlari madde madde tut.', tools: ['fs_read', 'fs_write'] },
};
