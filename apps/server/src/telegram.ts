// apps/server/src/telegram.ts
// Faz-2: Telegram botu — polling tabanlı, NAT arkasında da calisir (webhook gerektirmez).
// TELEGRAM_BOT_TOKEN env degiskeni ile baslatilir.
import https from 'node:https';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { dataDir } from '@jarvis/shared';

export interface TelegramBotAdapter {
  onText: (conv: string, text: string) => Promise<string>;
  onVoice: (conv: string, audio: Buffer) => Promise<string>;
}

const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

function httpGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c: string | Buffer) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function httpPostJson(url: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (c: string | Buffer) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function httpGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

export class TelegramBot {
  private token: string | null = null;
  private running = false;
  private offset = 0;
  private adapter: TelegramBotAdapter | null = null;
  private db: Database.Database | null = null;

  setAdapter(adapter: TelegramBotAdapter): void { this.adapter = adapter; }

  async start(token: string): Promise<void> {
    this.token = token;
    this.running = true;
    const dbPath = join(dataDir(), 'jarvis.db');
    this.db = new Database(dbPath);
    this.db.exec('CREATE TABLE IF NOT EXISTS telegram_chats (chat_id TEXT PRIMARY KEY, conv TEXT NOT NULL)');
    void this.poll(); // background polling loop
  }

  stop(): void {
    this.running = false;
    if (this.db) { this.db.close(); this.db = null; }
  }

  isRunning(): boolean { return this.running; }

  hasToken(): boolean { return !!this.token; }

  private async poll(): Promise<void> {
    while (this.running && this.token) {
      try {
        const updates = await httpGetJson(`${TELEGRAM_API(this.token!)}/getUpdates?offset=${this.offset}&timeout=25&limit=100`);
        if (updates.ok && Array.isArray(updates.result)) {
          for (const u of updates.result) {
            this.offset = u.update_id + 1;
            await this.handleUpdate(u);
          }
        }
      } catch {
        // hata olduysa biraz bekleyip tekrar dene
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  private convForChat(chatId: string): string {
    if (!this.db) return `tg:${chatId}`;
    const row = this.db.prepare('SELECT conv FROM telegram_chats WHERE chat_id = ?').get(chatId) as { conv: string } | undefined;
    if (row) return row.conv;
    const conv = `tg:${chatId}:${Date.now()}`;
    this.db.prepare('INSERT OR REPLACE INTO telegram_chats VALUES (?, ?)').run(chatId, conv);
    return conv;
  }

  private async handleUpdate(u: any): Promise<void> {
    const msg = u.message || u.edited_message;
    if (!msg) return;
    const chatId = String(msg.chat?.id);
    const conv = this.convForChat(chatId);
    const adapter = this.adapter;
    if (!adapter) return;

    if (msg.text) {
      const reply = await adapter.onText(conv, msg.text);
      await this.sendMessage(chatId, reply);
    } else if (msg.voice) {
      try {
        const file = await httpGetJson(`${TELEGRAM_API(this.token!)}/getFile?file_id=${msg.voice.file_id}`);
        if (file.ok && file.result?.file_path) {
          const audio = await httpGetBuffer(`https://api.telegram.org/file/bot${this.token}/${file.result.file_path}`);
          const reply = await adapter.onVoice(conv, audio);
          await this.sendMessage(chatId, reply);
        } else {
          await this.sendMessage(chatId, 'ses dosyasina ulasilamadi kanka.');
        }
      } catch {
        await this.sendMessage(chatId, 'sesli mesaj islenemedi kanka.');
      }
    }
  }

  async sendMessage(chatId: string | number, text: string): Promise<void> {
    if (!this.token) return;
    try {
      await httpPostJson(`${TELEGRAM_API(this.token!)}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      });
    } catch {
      // gonderilemezse susten gec (ag kesintisi vb.)
    }
  }
}

export const telegramBot = new TelegramBot();
