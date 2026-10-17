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
  tamir: { prompt: 'Sistem tamir ve aritma modundasin. USB baglama, dosya yazma/kopyalama, dosya sistemi kontrol ve onar, bozuk dosya tarama yapabilirsin. HER ISLEM ONAY GEREKTIRIR. Zararlı komutlari calistirma.', tools: ['usb_list', 'usb_copy', 'fs_check', 'fs_repair', 'fs_scan'] },
  guvenlik: { prompt: 'Guvenlik asistani modundasin. Kamera listesi, mikrofon tanima/onarim, antivirus tarama, yukleme-oncesi tarama, koruma modu ve self-iyilestirme yapabilirsin. HER ISLEM ONAY GEREKTIRIR. Zararlı komutlari calistirma.', tools: ['camera_list', 'camera_capture', 'camera_motion_detect', 'camera_record', 'mic_diagnose', 'mic_repair', 'av_scan', 'av_quarantine', 'av_quarantine_list', 'pre_scan', 'protection_status', 'protection_toggle', 'self_analyze', 'self_apply'] },
};
