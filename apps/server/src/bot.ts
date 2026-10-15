// apps/server/src/bot.ts
// Faz-2 Telegram prizi: Faz-1'de sadece kayit + test. Gercek baglanti Faz-2'de.
export interface BotAdapter {
  onText: (conv: string, text: string) => Promise<string>;
  onVoice: (conv: string, wav: Buffer) => Promise<string>;
}
let current: BotAdapter | null = null;
export function registerBot(adapter: BotAdapter): void { current = adapter; }
export function getBot(): BotAdapter | null { return current; }
