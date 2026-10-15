// apps/web/test/chat.test.tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../src/hooks/useChat.js';

describe('useChat kuyruk', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
  it('cevrimdisiyken kuyruga yazar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ag yok'); }));
    const { result } = renderHook(() => useChat('c1'));
    await act(async () => { await result.current.send('selam'); });
    expect(JSON.parse(localStorage.getItem('jarvis-kuyruk') ?? '[]')).toContain('selam');
  });
});
