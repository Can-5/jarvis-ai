import { describe, expect, it } from 'vitest';
import { Tier, BadgeId, ChatMessage } from '../src/index.js';

describe('shared semalar', () => {
  it('L1 gecerli kademedir', () => { expect(Tier.parse('L1')).toBe('L1'); });
  it('L9 gecersiz kademedir', () => { expect(() => Tier.parse('L9')).toThrow(); });
  it('siber gecerli rozettir', () => { expect(BadgeId.parse('siber')).toBe('siber'); });
  it('mesaj semasi ts ister', () => {
    expect(() => ChatMessage.parse({ role: 'user', content: 'selam' })).toThrow();
    expect(ChatMessage.parse({ role: 'user', content: 'selam', ts: 1 }).role).toBe('user');
  });
});
