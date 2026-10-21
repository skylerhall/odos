import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LngLat } from '../src/core/geo';
import { getRoutes } from '../src/services/mapbox';

const A: LngLat = [-105, 39.7];
const B: LngLat = [-104, 39.7];

// A one-step route whose only intersection is on a toll road.
const tollRoute = {
  distance: 85000,
  duration: 3600,
  geometry: { coordinates: [A, B] },
  legs: [
    {
      distance: 85000,
      steps: [
        {
          distance: 85000,
          duration: 3600,
          name: 'E-470',
          maneuver: { type: 'depart', instruction: 'Head east', location: A },
          intersections: [{ location: A, classes: ['toll'] }],
        },
        { distance: 0, duration: 0, name: '', maneuver: { type: 'arrive', instruction: 'Arrive', location: B } },
      ],
    },
  ],
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('getRoutes with avoid tolls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks Mapbox to exclude tolls', async () => {
    const fetchMock = vi.fn(async (_url: string) => ok({ code: 'Ok', routes: [{ ...tollRoute, legs: [] }] }));
    vi.stubGlobal('fetch', fetchMock);
    await getRoutes([A, B], { avoidTolls: true });
    expect(fetchMock.mock.calls[0][0]).toContain('exclude=toll');
  });

  it('falls back to the toll route when no toll-free route exists', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('exclude=toll') ? ok({ code: 'NoRoute', message: 'No route found', routes: [] }) : ok({ code: 'Ok', routes: [tollRoute] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const routes = await getRoutes([A, B], { avoidTolls: true });
    expect(routes[0].tolls).toBe(true);
    expect(fetchMock.mock.calls.at(-1)?.[0]).not.toContain('exclude=');
  });

  it('does not drop the toll setting when the connection fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getRoutes([A, B], { avoidTolls: true })).rejects.toThrow('Network request failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
