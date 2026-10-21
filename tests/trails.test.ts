import { describe, expect, it } from 'vitest';
import { destinationPoint, haversine, type LngLat } from '../src/core/geo';
import { NavTracker } from '../src/core/nav';
import {
  buildGraph,
  compassTo,
  extendTrack,
  lookAhead,
  newTrack,
  parseOverpass,
  retraceRoute,
  routeOnTrails,
  trailQuery,
  type TrailArea,
} from '../src/core/trails';

// A little network, meters east (x) and north (y) of a trailhead A:
//
//   C (0,1000)          E (400,900)
//   |  North Trail      |  East Trail
//   B (0,500) --------- D (400,500)
//   |  North Trail      |  Forest Road 12 (track)
//   A (0,0) -- F (500,0) gate
//
const ORIGIN: LngLat = [-105.5, 39.7];
const at = (x: number, y: number): LngLat => destinationPoint(destinationPoint(ORIGIN, y, 0), x, 90);
const P = { A: at(0, 0), B: at(0, 500), C: at(0, 1000), D: at(400, 500), E: at(400, 900), F: at(500, 0) };
const order = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const id = (k: (typeof order)[number]) => order.indexOf(k);

function area(extra: Partial<TrailArea> = {}): TrailArea {
  return {
    v: 1,
    id: 't',
    name: 'Test',
    center: ORIGIN,
    radiusM: 3000,
    createdAt: 0,
    coords: order.flatMap((k) => P[k]),
    ways: [
      { n: [id('A'), id('B'), id('C')], hw: 'path', name: 'North Trail' },
      { n: [id('B'), id('D'), id('E')], hw: 'path', name: 'East Trail' },
      { n: [id('A'), id('F'), id('D')], hw: 'track', name: 'Forest Road 12', grade: 3 },
    ],
    gates: [id('F')],
    barriers: [],
    pois: [],
    ...extra,
  };
}

describe('trail routing', () => {
  it('routes on foot along trails with turn prompts at junctions', () => {
    const g = buildGraph(area(), 'hike');
    const r = routeOnTrails(g, P.A, P.E)!;
    expect(r).not.toBeNull();
    expect(r.distance).toBeGreaterThan(1250);
    expect(r.distance).toBeLessThan(1350); // A-B-D-E, not round by the road
    const instructions = r.steps.map((s) => s.maneuver.instruction);
    expect(instructions[0]).toBe('Head north on North Trail');
    expect(instructions).toContain('Turn right onto East Trail');
    expect(instructions).toContain('Turn left onto East Trail');
    expect(r.steps.at(-1)?.maneuver.type).toBe('arrive');
    expect(r.cruiseMph).toBeCloseTo(2.5, 1);
  });

  it('keeps vehicles off footpaths and warns about gates', () => {
    const g = buildGraph(area(), 'offroad');
    expect(routeOnTrails(g, P.A, P.E)).not.toBeNull(); // E snaps to D, the end of the road
    const r = routeOnTrails(g, P.A, P.D)!;
    expect(r.steps[0].maneuver.instruction).toBe('Head east on Forest Road 12');
    expect(r.steps.flatMap((s) => s.voice.map((v) => v.text))).toContain('Gate ahead');
    expect(r.cruiseMph).toBeCloseTo(12, 0);
    // C is only reachable by footpath.
    expect(routeOnTrails(g, P.A, P.C)?.distance ?? 0).toBeLessThan(1100);
  });

  it('treats bollards as closed to vehicles but fine on foot', () => {
    const a = area({ barriers: [id('F')], gates: [] });
    expect(routeOnTrails(buildGraph(a, 'offroad'), P.A, P.D)).toBeNull();
    expect(routeOnTrails(buildGraph(a, 'hike'), P.A, P.D)).not.toBeNull();
  });

  it('gives up when you are far from any trail', () => {
    const g = buildGraph(area(), 'hike');
    expect(routeOnTrails(g, at(5000, 5000), P.E)).toBeNull();
  });

  it('navigates a trail route with the normal tracker', () => {
    const r = routeOnTrails(buildGraph(area(), 'hike'), P.A, P.E)!;
    const nav = new NavTracker(r);
    expect(nav.update(P.A).speak).toEqual(['Head north on North Trail']);
    const mid = nav.update(at(0, 450));
    expect(mid.speak).toEqual(['In 200 feet, turn right onto East Trail']);
    expect(mid.progress.next?.maneuver.instruction).toBe('Turn right onto East Trail');
    expect(nav.update(at(0, 300)).progress.offRoute).toBe(false);
  });
});

describe('look-ahead', () => {
  it('sees a dead end ahead on the trail', () => {
    const ahead = lookAhead(buildGraph(area(), 'hike'), at(0, 510), 0)!;
    expect(ahead.deadEndM).toBeGreaterThan(470);
    expect(ahead.deadEndM).toBeLessThan(510);
  });

  it('sees a gate, then the end of the road for vehicles', () => {
    const ahead = lookAhead(buildGraph(area(), 'offroad'), P.A, 90)!;
    expect(ahead.gateM).toBeCloseTo(500, -1);
    expect(ahead.deadEndM).toBeCloseTo(1010, -1); // A-F-D, then footpaths only
  });

  it('ignores dead ends at the edge of the downloaded area', () => {
    const ahead = lookAhead(buildGraph(area({ radiusM: 1000 }), 'hike'), at(0, 510), 0)!;
    expect(ahead.deadEndM).toBeUndefined();
  });
});

describe('breadcrumbs and compass', () => {
  it('records the track and turns it into a way back', () => {
    let t = newTrack(0);
    for (let y = 0; y <= 600; y += 3) t = extendTrack(t, at(0, y));
    expect(t.meters).toBeGreaterThan(590);
    expect(t.coords.length).toBeLessThan(80); // ignores jitter under 8 m
    const back = retraceRoute(t, 'hike')!;
    expect(haversine(back.line.coords[0], at(0, 600))).toBeLessThan(10);
    expect(haversine(back.line.coords.at(-1)!, P.A)).toBeLessThan(1);
    expect(back.steps[0].voice[0].text).toBe('Follow your track back to the start');
  });

  it('points the way when there is no trail', () => {
    expect(compassTo(P.A, P.C).point).toBe('N');
    const c = compassTo(P.A, P.E); // 24° east of north
    expect(c.point).toBe('NE');
    expect(c.meters).toBeCloseTo(haversine(P.A, P.E), 0);
  });
});

describe('Overpass download', () => {
  it('builds a compact area with gates, barriers, closures and places', () => {
    const json = {
      elements: [
        { type: 'way', id: 1, nodes: [10, 11, 12], tags: { highway: 'track', tracktype: 'grade4', name: 'FR 9', '4wd_only': 'yes' } },
        { type: 'way', id: 2, nodes: [12, 13], tags: { highway: 'path', motor_vehicle: 'yes' } },
        { type: 'way', id: 3, nodes: [13, 99], tags: { highway: 'service', access: 'private' } },
        { type: 'node', id: 10, lat: 39.7, lon: -105.5 },
        { type: 'node', id: 11, lat: 39.701, lon: -105.5 },
        { type: 'node', id: 12, lat: 39.702, lon: -105.5 },
        { type: 'node', id: 13, lat: 39.703, lon: -105.5 },
        { type: 'node', id: 11, lat: 39.701, lon: -105.5, tags: { barrier: 'gate' } },
        { type: 'node', id: 12, lat: 39.702, lon: -105.5, tags: { barrier: 'bollard' } },
        { type: 'node', id: 50, lat: 39.71, lon: -105.51, tags: { natural: 'peak', name: 'Bald Mtn' } },
        { type: 'node', id: 51, lat: 39.71, lon: -105.52, tags: { highway: 'trailhead' } },
      ],
    };
    const a = parseOverpass(json as Parameters<typeof parseOverpass>[0], { id: 'x', name: 'X', center: ORIGIN, radiusM: 5000, createdAt: 1 });
    expect(a.ways).toHaveLength(2); // way 3 has one known node
    expect(a.ways[0]).toMatchObject({ hw: 'track', grade: 4, fourWd: true, name: 'FR 9' });
    expect(a.ways[1]).toMatchObject({ hw: 'path', motor: true });
    expect(a.coords).toHaveLength(8);
    expect(a.gates).toEqual([1]);
    expect(a.barriers).toEqual([2]);
    expect(a.pois.map((p) => p.name).sort()).toEqual(['Bald Mtn', 'Trailhead']);
  });

  it('asks Overpass for trails, barriers and places around the point', () => {
    const q = trailQuery(ORIGIN, 8046.7);
    expect(q).toContain('(around:8047,39.70000,-105.50000)');
    expect(q).toContain('"highway"~"^(path|');
    expect(q).toContain('node.n["barrier"]');
  });
});
