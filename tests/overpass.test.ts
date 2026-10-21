import { afterEach, describe, expect, it, vi } from 'vitest';
import { overpass } from '../src/services/overpass';

const reply = (status: number, body: unknown = {}) => ({ ok: status === 200, status, json: async () => body });

describe('overpass', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries a busy server, then uses the second one', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
        calls.push(url);
        expect(init.headers['User-Agent']).toMatch(/^ODOS/);
        return url.includes('kumi') ? reply(200, { elements: [1] }) : reply(502);
      }),
    );
    const res = await overpass<{ elements: number[] }>('q', { timeoutMs: 1000, retryDelaysMs: [0, 0] });
    expect(res.elements).toEqual([1]);
    expect(calls.filter((u) => u.includes('overpass-api.de'))).toHaveLength(3);
    expect(calls.at(-1)).toContain('kumi');
  });

  it('moves straight to the next server on a non-busy error', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return url.includes('kumi') ? reply(200, { ok: true }) : reply(400);
      }),
    );
    await overpass('q', { timeoutMs: 1000, retryDelaysMs: [0, 0] });
    expect(calls).toHaveLength(2);
  });

  it('says plainly when everything is busy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(429)),
    );
    await expect(overpass('q', { timeoutMs: 1000, retryDelaysMs: [0] })).rejects.toThrow('busy');
  });
});
