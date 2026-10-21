// Live check against the real Overpass API: the trail query is valid, the response parses, and a
// route comes out. Not part of `npm test` (needs the network); run with `npm run test:live` or the
// "Live checks" workflow.
import { expect, it } from 'vitest';
import { haversine, type LngLat } from '../../src/core/geo';
import { buildGraph, parseOverpass, routeOnTrails, trailQuery } from '../../src/core/trails';
import { OVERPASS_HEADERS } from '../../src/services/http';

const CHAUTAUQUA: LngLat = [-105.2925, 39.999]; // trailhead in Boulder, CO
const RADIUS = 1500;

it('downloads, parses and routes real trails', async () => {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: OVERPASS_HEADERS,
    body: `data=${encodeURIComponent(trailQuery(CHAUTAUQUA, RADIUS))}`,
  });
  const text = await res.text();
  expect(res.status, text.slice(0, 500)).toBe(200);
  const area = parseOverpass(JSON.parse(text), { id: 'live', name: 'live', center: CHAUTAUQUA, radiusM: RADIUS, createdAt: 0 });
  const kinds = new Map<string, number>();
  area.ways.forEach((w) => kinds.set(w.hw, (kinds.get(w.hw) ?? 0) + 1));
  console.log(`ways ${area.ways.length}, nodes ${area.coords.length / 2}, gates ${area.gates.length}, barriers ${area.barriers.length}, places ${area.pois.length}, ${(JSON.stringify(area).length / 1e3).toFixed(0)} kB`);
  console.log(`highways: ${[...kinds].map(([k, n]) => `${k}=${n}`).join(' ')}`);
  console.log(`places: ${area.pois.slice(0, 10).map((p) => `${p.kind}:${p.name}`).join(' | ')}`);
  expect(area.ways.filter((w) => w.hw === 'path' || w.hw === 'footway').length).toBeGreaterThan(5);

  const g = buildGraph(area, 'hike');
  const target = area.pois.find((p) => p.kind === 'peak' || p.kind === 'viewpoint') ?? area.pois[0];
  expect(target).toBeDefined();
  const r = routeOnTrails(g, CHAUTAUQUA, target.coord);
  console.log(
    r
      ? `route to ${target.name}: ${(r.distance / 1609.344).toFixed(2)} mi (straight line ${(haversine(CHAUTAUQUA, target.coord) / 1609.344).toFixed(2)}), ${Math.round(r.duration / 60)} min, ${r.steps.length} steps: ${r.steps
          .slice(0, 6)
          .map((s) => s.maneuver.instruction)
          .join(' | ')}`
      : `no route to ${target.name}`,
  );
  expect(r).not.toBeNull();
}, 120000);
