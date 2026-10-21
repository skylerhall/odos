import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LngLat } from '../src/core/geo';
import { searchWhereTo } from '../src/services/placeSearch';

const ME: LngLat = [-105, 39.7];
const station = (id: string, lng: number) => ({
  geometry: { coordinates: [lng, 39.7] },
  properties: { mapbox_id: id, name: `Station ${id}`, full_address: `${id} Main St` },
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('searchWhereTo', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the nearest gas stations by drive time, not straight-line distance', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes('/category/gas_station')) return ok({ features: [station('near', -104.99), station('far', -104.95)] });
        // The closer station is across the highway: 9 minutes vs 4.
        if (url.includes('directions-matrix')) return ok({ durations: [[0, 540, 240]], distances: [[0, 1500, 4800]] });
        throw new Error(`unexpected ${url}`);
      }),
    );
    const res = await searchWhereTo('nearest gas station', ME);
    expect(res.heading).toBe('Nearest gas stations');
    expect(res.places.map((p) => p.id)).toEqual(['far', 'near']);
    expect(res.places[0]).toMatchObject({ kind: 'gas', driveSeconds: 240, meters: 4800 });
    expect(urls.some((u) => u.includes('proximity=-105%2C39.7'))).toBe(true);
  });

  it('falls back to straight-line order when drive times are unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/category/')) return ok({ features: [station('far', -104.9), station('near', -104.99)] });
        throw new TypeError('Network request failed');
      }),
    );
    const res = await searchWhereTo('gas near me', ME);
    expect(res.places.map((p) => p.id)).toEqual(['near', 'far']);
    expect(res.places[0].driveSeconds).toBeUndefined();
  });

  it('keeps ordinary searches as they were', async () => {
    const fetchMock = vi.fn(async (_url: string) => ok({ features: [station('x', -104.9)] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await searchWhereTo('Union Station Denver', ME);
    expect(res.heading).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toContain('/forward?');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
