import { afterEach, describe, expect, it, vi } from 'vitest';
import { haversine, type LngLat } from '../src/core/geo';
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

describe('getRoutes on long trips', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Pretend Mapbox routes at most 1,000 km per request, in a straight line with one step.
  const LIMIT = 1_000_000;
  const tooFar = { ok: false, status: 422, json: async () => ({ code: 'InvalidInput', message: 'Route exceeds maximum distance limitation' }) };
  const straight = (a: LngLat, b: LngLat) => {
    const d = haversine(a, b);
    return {
      distance: d,
      duration: d / 25,
      geometry: { coordinates: [a, b] },
      legs: [
        {
          distance: d,
          annotation: { congestion: ['low'], maxspeed: [{ speed: 65, unit: 'mph' }] },
          steps: [
            {
              distance: d,
              duration: d / 25,
              name: 'I-80',
              maneuver: { type: 'depart', instruction: 'Head east on I-80', location: a },
              voiceInstructions: [{ distanceAlongGeometry: 800, announcement: 'You will arrive at your destination' }],
            },
            { distance: 0, duration: 0, name: '', maneuver: { type: 'arrive', instruction: 'You have arrived', location: b } },
          ],
        },
      ],
    };
  };
  function mapbox(calls: string[]) {
    return vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/geocode/v6/reverse')) {
        const q = new URL(url).searchParams;
        // The "town" is a little off the halfway point.
        return ok({ features: [{ geometry: { coordinates: [Number(q.get('longitude')) + 0.01, Number(q.get('latitude'))] }, properties: {} }] });
      }
      const path = new URL(url).pathname.split('/').at(-1)!;
      const pts = path.split(';').map((p) => p.split(',').map(Number) as LngLat);
      const total = pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);
      if (total > LIMIT) return tooFar;
      const legs = pts.slice(1).map((p, i) => straight(pts[i], p));
      return ok({ code: 'Ok', routes: [{ ...legs[0], distance: total, legs: legs.flatMap((l) => l.legs), geometry: { coordinates: pts } }] });
    });
  }

  const NYC: LngLat = [-74.0, 40.71];
  const SF: LngLat = [-122.42, 37.77];

  it('splits a cross-country leg at towns and joins it into one route', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', mapbox(calls));
    const [r] = await getRoutes([NYC, SF], { heading: 90 });
    expect(r.distance).toBeGreaterThan(haversine(NYC, SF));
    expect(r.distance).toBeLessThan(haversine(NYC, SF) * 1.02);
    expect(r.legEnds).toHaveLength(1);
    const types = r.steps.map((s) => s.maneuver.type);
    expect(types.filter((t) => t === 'arrive')).toHaveLength(1);
    expect(types[0]).toBe('depart');
    expect(types.at(-1)).toBe('arrive');
    expect(types.filter((t) => t === 'continue').length).toBeGreaterThan(0);
    // Only the real arrival is announced.
    expect(r.steps.flatMap((s) => s.voice.map((v) => v.text)).filter((t) => /arrive/.test(t))).toHaveLength(1);
    expect(r.congestion).toHaveLength(r.line.coords.length - 1);
    expect(r.speedLimits.every((v) => v === 65)).toBe(true);
    // Only the first piece keeps the driver's heading.
    const routed = calls.filter((u) => u.includes('/directions/'));
    const withHeading = routed.filter((u) => u.includes('bearings='));
    expect(withHeading.length).toBeGreaterThan(0);
    expect(withHeading.every((u) => u.includes(`/${NYC[0].toFixed(6)},${NYC[1].toFixed(6)};`))).toBe(true);
  });

  it('keeps stops as their own legs', async () => {
    vi.stubGlobal('fetch', mapbox([]));
    const CHI: LngLat = [-87.63, 41.88];
    const [r] = await getRoutes([NYC, CHI, SF]);
    expect(r.legEnds).toHaveLength(2);
    expect(r.legEnds[0]).toBeCloseTo(haversine(NYC, CHI), -3);
    expect(r.steps.filter((s) => s.maneuver.type === 'arrive')).toHaveLength(2);
  });

  it('passes other errors through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ code: 'NoRoute', message: 'No route found', routes: [] })));
    await expect(getRoutes([NYC, SF])).rejects.toThrow('No route found');
  });
});
