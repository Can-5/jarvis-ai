// packages/llm/src/keystore.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, type ProviderId } from '@jarvis/shared';

function masterKey(): Buffer {
  const env = process.env.JARVIS_MASTER_KEY;
  if (env) return Buffer.from(env, 'hex');
  const p = join(dataDir(), '.masterkey');
  if (!existsSync(p)) { writeFileSync(p, randomBytes(32).toString('hex'), { mode: 0o600 }); }
  else chmodSync(p, 0o600);
  return Buffer.from(readFileSync(p, 'utf8').trim(), 'hex');
}

export class KeyStore {
  private dir(): string {
    const d = join(dataDir(), 'keys');
    mkdirSync(d, { recursive: true });
    return d;
  }
  async save(provider: ProviderId, key: string): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
    const enc = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    writeFileSync(join(this.dir(), `${provider}.enc`),
      JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: enc.toString('hex') }),
      { mode: 0o600 });
  }
  async get(provider: ProviderId): Promise<string | null> {
    const p = join(this.dir(), `${provider}.enc`);
    if (!existsSync(p)) return null;
    const { iv, tag, data } = JSON.parse(readFileSync(p, 'utf8')) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
  }
}
