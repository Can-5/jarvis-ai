// packages/agent-core/src/memory.ts
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { dataDir, ChatMessage, type BadgeId } from '@jarvis/shared';

export class Memory {
  private db: Database.Database;
  constructor(path?: string) {
    this.db = new Database(path ?? join(dataDir(), 'jarvis.db'));
    this.db.exec(`CREATE TABLE IF NOT EXISTS turns
      (conv TEXT, role TEXT, content TEXT, ts INTEGER)`);
  }
  saveTurn(conv: string, user: string, assistant: string): void {
    const ts = Date.now();
    const ins = this.db.prepare('INSERT INTO turns VALUES (?, ?, ?, ?)');
    ins.run(conv, 'user', user, ts);
    ins.run(conv, 'assistant', assistant, ts);
  }
  lastMessages(conv: string, n: number): ChatMessage[] {
    const rows = this.db.prepare(
      'SELECT role, content, ts FROM turns WHERE conv = ? ORDER BY rowid DESC LIMIT ?',
    ).all(conv, n) as { role: string; content: string; ts: number }[];
    return rows.reverse().map((r) => ChatMessage.parse(r));
  }
  close(): void { this.db.close(); }
}
export type { BadgeId };
