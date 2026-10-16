// apps/web/test/settings.test.tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from '../src/pages/Settings.js';

describe('Settings', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('kaydet dugmesi ayarlari gonderir', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init?.method]);
      if (url === '/api/settings' && !init) return new Response(JSON.stringify({ asistan_adi: 'JARVIS' }));
      return new Response(JSON.stringify({ ok: true }));
    }));
    render(<Settings />);
    await waitFor(() => screen.getByLabelText('Asistan adı'));
    fireEvent.click(screen.getByText('kaydet'));
    await waitFor(() => expect(calls.some(([u, m]) => u === '/api/settings' && m === 'PUT')).toBe(true));
  });
});
