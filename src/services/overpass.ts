// The public OpenStreetMap Overpass servers. They're shared and often busy, so a busy answer
// (429 / 502 / 503 / 504, "request queue is full") is retried after a pause, then tried on the next
// server, before giving up.

import { fetchJson, HttpError, OVERPASS_HEADERS } from './http';

const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const BUSY = new Set([429, 502, 503, 504]);

export async function overpass<T>(query: string, opts: { timeoutMs: number; retryDelaysMs?: number[] }): Promise<T> {
  const delays = opts.retryDelaysMs ?? [2000, 5000];
  let last: unknown = null;
  for (const url of SERVERS) {
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await fetchJson<T>(url, {
          method: 'POST',
          headers: OVERPASS_HEADERS,
          body: `data=${encodeURIComponent(query)}`,
          timeoutMs: opts.timeoutMs,
        });
      } catch (e) {
        last = e;
        const busy = e instanceof HttpError && BUSY.has(e.status);
        if (!busy || attempt === delays.length) break; // not busy (or out of retries): try the next server
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
  }
  if (last instanceof HttpError && BUSY.has(last.status)) throw new Error('The trail data servers are busy. Try again in a minute.');
  throw last instanceof Error ? last : new Error('Overpass request failed');
}
