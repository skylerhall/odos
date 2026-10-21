// Trail Mode: a trail network downloaded ahead of time (OpenStreetMap), routing on it with no signal,
// and the helpers that keep working offline: breadcrumb track, back to start, dead-end and gate
// look-ahead, and a compass to the destination. Two modes over the same data: on foot or bike
// (paths, footways, tracks) and off-road driving (tracks and back roads, no footpaths).

import { bearing, buildLine, haversine, type LngLat } from './geo';
import type { Route, Step } from './route';

export type TrailMode = 'hike' | 'offroad';

/** A downloaded trail area, compact enough to store as one JSON file. */
export type TrailArea = {
  v: 1;
  id: string;
  name: string;
  center: LngLat;
  radiusM: number;
  createdAt: number;
  /** Node positions, flat: [lon, lat, lon, lat, …], 5 decimals (about 1 m). */
  coords: number[];
  ways: TrailWay[];
  /** Node indices with a gate: passable, but worth a warning when driving. */
  gates: number[];
  /** Node indices with a vehicle barrier (bollards, boulders, stiles): fine on foot, closed to vehicles. */
  barriers: number[];
  pois: TrailPoi[];
};

export type TrailWay = {
  /** Node indices into `coords`, in order. */
  n: number[];
  /** OSM highway=* value. */
  hw: string;
  name?: string;
  /** OSM tracktype grade 1 (paved/solid) to 5 (soft, rough). */
  grade?: number;
  fourWd?: boolean;
  /** Explicit OSM permissions: true = yes, false = no, absent = not tagged. */
  foot?: boolean;
  motor?: boolean;
  closed?: boolean;
};

export type TrailPoi = { name: string; kind: string; coord: LngLat };

// ── download ──

const HIGHWAYS = 'path|footway|track|bridleway|cycleway|steps|pedestrian|unclassified|service|residential|tertiary|living_street';

/** Overpass QL for everything Trail Mode needs inside a circle. */
export function trailQuery(center: LngLat, radiusM: number): string {
  const a = `(around:${Math.round(radiusM)},${center[1].toFixed(5)},${center[0].toFixed(5)})`;
  return `[out:json][timeout:120];
way["highway"~"^(${HIGHWAYS})$"]${a}->.w;
.w out body qt;
node(w.w)->.n;
.n out skel qt;
node.n["barrier"];
out body qt;
(
  node["natural"~"^(peak|spring|waterfall|saddle|cave_entrance)$"]["name"]${a};
  node["tourism"~"^(viewpoint|camp_site|picnic_site|alpine_hut|wilderness_hut)$"]${a};
  node["highway"="trailhead"]${a};
  node["amenity"~"^(parking|drinking_water|shelter|toilets)$"]["name"]${a};
);
out body qt;`;
}

type OsmElement = { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> };

const yes = (v?: string) => (v == null ? undefined : ['yes', 'designated', 'permissive', 'official'].includes(v) ? true : v === 'no' ? false : undefined);
const GATES = new Set(['gate', 'lift_gate', 'swing_gate', 'sliding_gate']);
const BARRIERS = new Set(['bollard', 'block', 'jersey_barrier', 'stile', 'kissing_gate', 'turnstile', 'log', 'chain', 'motorcycle_barrier']);

/** Turns an Overpass response (from trailQuery) into a compact TrailArea. */
export function parseOverpass(json: { elements: OsmElement[] }, meta: Pick<TrailArea, 'id' | 'name' | 'center' | 'radiusM' | 'createdAt'>): TrailArea {
  const pos = new Map<number, LngLat>();
  const tagged = new Map<number, Record<string, string>>();
  const osmWays: OsmElement[] = [];
  for (const e of json.elements ?? []) {
    if (e.type === 'node' && e.lat != null && e.lon != null) {
      pos.set(e.id, [e.lon, e.lat]);
      if (e.tags) tagged.set(e.id, e.tags);
    } else if (e.type === 'way' && e.nodes && e.tags) osmWays.push(e);
  }

  const index = new Map<number, number>();
  const coords: number[] = [];
  const idx = (id: number) => {
    let i = index.get(id);
    if (i == null) {
      const p = pos.get(id)!;
      i = index.size;
      index.set(id, i);
      coords.push(+p[0].toFixed(5), +p[1].toFixed(5));
    }
    return i;
  };

  const ways: TrailWay[] = [];
  for (const w of osmWays) {
    const ids = w.nodes!.filter((id) => pos.has(id));
    if (ids.length < 2) continue;
    const t = w.tags!;
    const way: TrailWay = { n: ids.map(idx), hw: t.highway };
    if (t.name ?? t.ref) way.name = t.name ?? t.ref;
    const g = /^grade([1-5])$/.exec(t.tracktype ?? '');
    if (g) way.grade = Number(g[1]);
    if (t['4wd_only'] === 'yes') way.fourWd = true;
    const foot = yes(t.foot);
    if (foot != null) way.foot = foot;
    const motor = yes(t.motor_vehicle) ?? yes(t.motorcar) ?? yes(t.vehicle);
    if (motor != null) way.motor = motor;
    if (t.access === 'no' || t.access === 'private') way.closed = true;
    ways.push(way);
  }

  const gates: number[] = [];
  const barriers: number[] = [];
  const pois: TrailPoi[] = [];
  for (const [id, t] of tagged) {
    if (t.barrier && index.has(id)) {
      if (GATES.has(t.barrier)) gates.push(index.get(id)!);
      else if (BARRIERS.has(t.barrier)) barriers.push(index.get(id)!);
    }
    const kind = poiKind(t);
    if (kind) pois.push({ name: t.name ?? KIND_NAMES[kind] ?? kind, kind, coord: pos.get(id)! });
  }
  return { v: 1, ...meta, coords, ways, gates, barriers, pois };
}

const KIND_NAMES: Record<string, string> = { trailhead: 'Trailhead', viewpoint: 'Viewpoint', camp_site: 'Campsite', drinking_water: 'Water' };

function poiKind(t: Record<string, string>): string | null {
  if (t.highway === 'trailhead') return 'trailhead';
  if (t.natural && /^(peak|spring|waterfall|saddle|cave_entrance)$/.test(t.natural) && t.name) return t.natural;
  if (t.tourism && /^(viewpoint|camp_site|picnic_site|alpine_hut|wilderness_hut)$/.test(t.tourism)) return t.tourism;
  if (t.amenity && /^(parking|drinking_water|shelter|toilets)$/.test(t.amenity) && t.name) return t.amenity;
  return null;
}

// ── network ──

type Edge = { to: number; meters: number; seconds: number; way: number };
export type TrailGraph = {
  mode: TrailMode;
  area: TrailArea;
  pts: LngLat[];
  edges: Edge[][];
  /** Fastest speed on any edge, m/s (keeps the A* estimate admissible). */
  maxSpeed: number;
};

const MPH = 0.44704;
const ROADS = new Set(['unclassified', 'service', 'residential', 'tertiary', 'living_street']);

/** Moving speed in mph for a way in a mode, or null if the mode can't use it. */
export function waySpeed(w: TrailWay, mode: TrailMode): number | null {
  if (mode === 'hike') {
    if (w.foot === false || (w.closed && w.foot !== true)) return null;
    if (ROADS.has(w.hw)) return w.hw === 'tertiary' ? 2.5 : 2.8; // allowed, but trails win (see edge cost)
    return w.hw === 'cycleway' || w.hw === 'pedestrian' ? 3 : 2.5;
  }
  if (w.motor === false || (w.closed && w.motor !== true)) return null;
  if (w.hw === 'track') return w.fourWd ? 6 : ({ 1: 25, 2: 18, 3: 12, 4: 8, 5: 5 } as Record<number, number>)[w.grade ?? 0] ?? 10;
  if (w.hw === 'path' || w.hw === 'bridleway') return w.motor ? 8 : null; // ATV/OHV trails only when tagged
  return ({ unclassified: 30, tertiary: 35, residential: 25, living_street: 10, service: 12 } as Record<string, number>)[w.hw] ?? null;
}

export function buildGraph(area: TrailArea, mode: TrailMode): TrailGraph {
  const n = area.coords.length / 2;
  const pts: LngLat[] = Array.from({ length: n }, (_, i) => [area.coords[2 * i], area.coords[2 * i + 1]]);
  const edges: Edge[][] = Array.from({ length: n }, () => []);
  const blocked = new Set(mode === 'offroad' ? area.barriers : []);
  let maxSpeed = 1;
  area.ways.forEach((w, wi) => {
    const mph = waySpeed(w, mode);
    if (mph == null) return;
    // On foot, a road costs a little more than a trail of the same length, so routes stay on trails.
    const penalty = mode === 'hike' && ROADS.has(w.hw) ? 1.3 : 1;
    const ms = mph * MPH;
    maxSpeed = Math.max(maxSpeed, ms / penalty);
    for (let k = 0; k < w.n.length - 1; k++) {
      const a = w.n[k];
      const b = w.n[k + 1];
      if (blocked.has(a) || blocked.has(b)) continue;
      const meters = haversine(pts[a], pts[b]);
      const seconds = (meters / ms) * penalty;
      edges[a].push({ to: b, meters, seconds, way: wi });
      edges[b].push({ to: a, meters, seconds, way: wi });
    }
  });
  return { mode, area, pts, edges, maxSpeed };
}

/** Nearest node on the network (one the mode can use) and how far away it is. */
export function nearestNode(g: TrailGraph, p: LngLat): { node: number; meters: number } | null {
  const kx = Math.cos((p[1] * Math.PI) / 180);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < g.pts.length; i++) {
    if (!g.edges[i].length) continue;
    const dx = (g.pts[i][0] - p[0]) * kx;
    const dy = g.pts[i][1] - p[1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? null : { node: best, meters: haversine(g.pts[best], p) };
}

/** Farthest you can be from the network and still be routed onto it. */
export const MAX_SNAP_M = 400;

export type TrailPath = { nodes: number[]; ways: number[]; meters: number; seconds: number };

/** Fastest path between two nodes (A*). */
export function shortestPath(g: TrailGraph, from: number, to: number): TrailPath | null {
  const h = (i: number) => haversine(g.pts[i], g.pts[to]) / g.maxSpeed;
  const cost = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, { node: number; edge: Edge }>();
  const heap = new MinHeap();
  heap.push(from, h(from));
  const done = new Set<number>();
  while (heap.size) {
    const cur = heap.pop()!;
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    const c = cost.get(cur)!;
    for (const e of g.edges[cur]) {
      const nc = c + e.seconds;
      if (nc < (cost.get(e.to) ?? Infinity)) {
        cost.set(e.to, nc);
        prev.set(e.to, { node: cur, edge: e });
        heap.push(e.to, nc + h(e.to));
      }
    }
  }
  if (from !== to && !prev.has(to)) return null;
  const nodes = [to];
  const ways: number[] = [];
  let meters = 0;
  for (let at = to; at !== from; ) {
    const p = prev.get(at)!;
    nodes.push(p.node);
    ways.push(p.edge.way);
    meters += p.edge.meters;
    at = p.node;
  }
  return { nodes: nodes.reverse(), ways: ways.reverse(), meters, seconds: cost.get(to) ?? 0 };
}

class MinHeap {
  private items: { v: number; k: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(v: number, k: number) {
    const a = this.items;
    a.push({ v, k });
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// ── turn-by-turn ──

const cardinal = (deg: number) => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
export const compassPoint = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];

function turnModifier(deltaDeg: number): string | null {
  const d = ((deltaDeg + 540) % 360) - 180; // -180..180, + is right
  const a = Math.abs(d);
  if (a < 25) return null;
  const side = d > 0 ? 'right' : 'left';
  if (a < 60) return `slight ${side}`;
  if (a < 140) return side;
  return a < 170 ? `sharp ${side}` : 'uturn';
}

const feet = (m: number) => {
  const ft = m * 3.28084;
  return ft >= 1000 ? `${(m / 1609.344).toFixed(1).replace(/\.0$/, '')} miles` : `${Math.max(50, Math.round(ft / 50) * 50)} feet`;
};

/**
 * Builds a Route (the shape the app already navigates with: banner, voice, off-route) from a trail
 * path, including the walk or drive from `from` onto the network and from it to `to`.
 */
export function trailRouteToRoute(g: TrailGraph, path: TrailPath, from: LngLat, to: LngLat): Route {
  const nodes = path.nodes;
  const coords: LngLat[] = [];
  if (haversine(from, g.pts[nodes[0]]) > 5) coords.push(from);
  const firstNodeAt = coords.length;
  for (const i of nodes) coords.push(g.pts[i]);
  if (haversine(to, g.pts[nodes[nodes.length - 1]]) > 5) coords.push(to);
  if (coords.length < 2) coords.push(to);
  const line = buildLine(coords);
  const speed = path.meters > 0 && path.seconds > 0 ? path.meters / path.seconds : 1.1;
  const lead = g.mode === 'hike' ? 60 : 250;
  const name = (wi: number | undefined) => (wi == null ? undefined : g.area.ways[wi].name);
  const defaultName = g.mode === 'hike' ? 'the trail' : 'the track';
  const degree = (i: number) => g.edges[i].length;

  // Maneuvers: where the route leaves its way at a junction with a real turn, or the name changes.
  type Turn = { at: number; coordIndex: number; modifier: string | null; onto: string | undefined };
  const turns: Turn[] = [];
  for (let k = 1; k < nodes.length - 1; k++) {
    const inWay = path.ways[k - 1];
    const outWay = path.ways[k];
    if (degree(nodes[k]) < 3 && inWay === outWay) continue;
    const ci = firstNodeAt + k;
    const delta = bearing(coords[ci], coords[ci + 1]) - bearing(coords[ci - 1], coords[ci]);
    const modifier = turnModifier(delta);
    const renamed = name(inWay) !== name(outWay) && name(outWay) != null;
    if (degree(nodes[k]) >= 3 && (modifier || renamed)) turns.push({ at: line.cum[ci], coordIndex: ci, modifier, onto: name(outWay) });
  }

  const startBearing = bearing(coords[0], coords[1]);
  const steps: Step[] = [];
  const marks = [0, ...turns.map((t) => t.at), line.length];
  const instruction = (t: Turn) =>
    t.modifier === 'uturn'
      ? `Make a U-turn onto ${t.onto ?? defaultName}`
      : t.modifier
        ? `Turn ${t.modifier} onto ${t.onto ?? defaultName}`
        : `Continue onto ${t.onto ?? defaultName}`;
  for (let s = 0; s < marks.length - 1; s++) {
    const start = marks[s];
    const end = marks[s + 1];
    const turn = s === 0 ? null : turns[s - 1];
    const maneuver =
      s === 0
        ? { type: 'depart', instruction: `Head ${cardinal(startBearing)} on ${name(path.ways[0]) ?? defaultName}`, location: coords[0] }
        : { type: 'turn', modifier: turn!.modifier ?? 'straight', instruction: instruction(turn!), location: coords[turn!.coordIndex] };
    const next = turns[s];
    const voice: Step['voice'] = s === 0 ? [{ at: 0, text: maneuver.instruction }] : [];
    const say = next ? instruction(next) : 'You have arrived';
    if (end - start > lead * 1.5) voice.push({ at: end - lead, text: `In ${feet(lead)}, ${say[0].toLowerCase()}${say.slice(1)}` });
    voice.push({ at: Math.max(start, end - 15), text: say });
    steps.push({ start, distance: end - start, duration: (end - start) / speed, name: name(path.ways[0]) ?? defaultName, maneuver, voice });
  }
  steps.push({
    start: line.length,
    distance: 0,
    duration: 0,
    name: '',
    maneuver: { type: 'arrive', instruction: 'Arrive', location: coords[coords.length - 1] },
    voice: [],
  });

  // Gates ahead (driving): a heads-up shortly before each one on the route.
  if (g.mode === 'offroad') {
    const gateSet = new Set(g.area.gates);
    nodes.forEach((node, k) => {
      if (!gateSet.has(node)) return;
      const at = line.cum[firstNodeAt + k];
      const step = steps.find((st) => at >= st.start && at < st.start + st.distance) ?? steps[0];
      step.voice.push({ at: Math.max(step.start, at - 150), text: 'Gate ahead' });
      step.voice.sort((a, b) => a.at - b.at);
    });
  }

  return {
    line,
    distance: line.length,
    duration: line.length / speed,
    steps,
    lanes: [],
    congestion: [],
    legEnds: [line.length],
    cruiseMph: speed / MPH,
    tolls: false,
    speedLimits: [],
  };
}

/** Route from `from` to `to` on the network, or null when either end is too far from it or unreachable. */
export function routeOnTrails(g: TrailGraph, from: LngLat, to: LngLat): Route | null {
  const a = nearestNode(g, from);
  const b = nearestNode(g, to);
  if (!a || !b || a.meters > MAX_SNAP_M || b.meters > MAX_SNAP_M) return null;
  const path = shortestPath(g, a.node, b.node);
  return path ? trailRouteToRoute(g, path, from, to) : null;
}

// ── safety helpers ──

export type LookAhead = { deadEndM?: number; gateM?: number; junctionM?: number };

/**
 * Follows the trail you're on, in the direction you're heading, to the next junction: says how far
 * to a dead end or gate before it. Dead ends near the edge of the downloaded area are ignored (the
 * trail just continues outside it).
 */
export function lookAhead(g: TrailGraph, p: LngLat, headingDeg: number, maxM = 3000): LookAhead | null {
  const near = nearestNode(g, p);
  if (!near || near.meters > 60) return null;
  const diff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  let prev = near.node;
  let edge = g.edges[prev].reduce<Edge | null>((best, e) => {
    const d = diff(bearing(g.pts[prev], g.pts[e.to]), headingDeg);
    return !best || d < diff(bearing(g.pts[prev], g.pts[best.to]), headingDeg) ? e : best;
  }, null);
  if (!edge || diff(bearing(g.pts[prev], g.pts[edge.to]), headingDeg) > 100) return null;
  const gates = new Set(g.area.gates);
  const out: LookAhead = {};
  // Distances count from you: subtract the bit to a node already behind you, add one still ahead.
  const behind = near.meters > 1 && diff(bearing(p, g.pts[near.node]), headingDeg) > 90;
  let meters = behind ? -near.meters : near.meters;
  for (let hops = 0; hops < 5000 && edge; hops++) {
    meters += edge.meters;
    const at: number = edge.to;
    if (meters > maxM) break;
    if (out.gateM == null && gates.has(at)) out.gateM = meters;
    const deg = g.edges[at].length;
    if (deg === 1) {
      if (haversine(g.pts[at], g.area.center) < g.area.radiusM * 0.95) out.deadEndM = meters;
      break;
    }
    if (deg >= 3) {
      out.junctionM = meters;
      break;
    }
    const from: number = prev;
    prev = at;
    edge = g.edges[at].find((e) => e.to !== from) ?? null;
  }
  return out;
}

export type Track = { coords: LngLat[]; meters: number; startedAt: number };

export const newTrack = (at = Date.now()): Track => ({ coords: [], meters: 0, startedAt: at });

/** Adds a GPS point to the breadcrumb track once you've moved far enough to be sure it's real. */
export function extendTrack(t: Track, p: LngLat, minStepM = 8): Track {
  const last = t.coords[t.coords.length - 1];
  if (!last) return { ...t, coords: [p] };
  const d = haversine(last, p);
  if (d < minStepM) return t;
  return { ...t, coords: [...t.coords, p], meters: t.meters + d };
}

/** "Back to start": the breadcrumb track reversed, as a route to follow. */
export function retraceRoute(t: Track, mode: TrailMode): Route | null {
  if (t.coords.length < 2) return null;
  const coords = [...t.coords].reverse();
  const line = buildLine(coords);
  const speed = (mode === 'hike' ? 2.5 : 10) * MPH;
  const say = 'Follow your track back to the start';
  return {
    line,
    distance: line.length,
    duration: line.length / speed,
    steps: [
      {
        start: 0,
        distance: line.length,
        duration: line.length / speed,
        name: 'your track',
        maneuver: { type: 'depart', instruction: say, location: coords[0] },
        voice: [
          { at: 0, text: say },
          { at: Math.max(0, line.length - 15), text: 'You are back at the start' },
        ],
      },
      { start: line.length, distance: 0, duration: 0, name: '', maneuver: { type: 'arrive', instruction: 'Back at the start', location: coords[coords.length - 1] }, voice: [] },
    ],
    lanes: [],
    congestion: [],
    legEnds: [line.length],
    cruiseMph: speed / MPH,
    tolls: false,
    speedLimits: [],
  };
}

/** Straight-line direction and distance, for when there's no trail to follow. */
export function compassTo(from: LngLat, to: LngLat): { bearing: number; meters: number; point: string } {
  const b = bearing(from, to);
  return { bearing: b, meters: haversine(from, to), point: compassPoint(b) };
}

/** The trails a mode can use, as map lines (for drawing the network). */
export function trailLines(g: TrailGraph): { coords: LngLat[]; hw: string; grade?: number; fourWd?: boolean }[] {
  return g.area.ways.filter((w) => waySpeed(w, g.mode) != null).map((w) => ({ coords: w.n.map((i) => g.pts[i]), hw: w.hw, grade: w.grade, fourWd: w.fourWd }));
}
