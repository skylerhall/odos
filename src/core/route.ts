// Turns a Mapbox Directions API route into the shape the app navigates with.

import { buildLine, pointAt, type Line, type LngLat } from './geo';
import type { LaneGuide } from './lanes';

export type Maneuver = { type: string; modifier?: string; instruction: string; location: LngLat };

export type Step = {
  /** Meters from route start to where this step begins. */
  start: number;
  distance: number;
  duration: number;
  name: string;
  maneuver: Maneuver;
  /** Spoken prompts, keyed by meters from route start at which to say them. */
  voice: { at: number; text: string }[];
};

export type LaneSpot = { at: number; location: LngLat; lanes: LaneGuide[] };

export type Congestion = 'low' | 'moderate' | 'heavy' | 'severe' | 'unknown';

export type Route = {
  line: Line;
  distance: number;
  duration: number;
  steps: Step[];
  lanes: LaneSpot[];
  /** Per-segment congestion level, aligned with line segments (length = coords - 1). */
  congestion: Congestion[];
  /** Meters from route start where each leg ends (one leg per stop, then the destination). */
  legEnds: number[];
  /** Average moving speed over the route, mph. Feeds the realistic-range estimate. */
  cruiseMph: number;
  /** True if any stretch of the route is a toll road. */
  tolls: boolean;
  /** Posted speed limit per line segment, mph; null where Mapbox doesn't know it. */
  speedLimits: (number | null)[];
};

// Minimal typing for the parts of the Directions API response we read.
type ApiLane = { valid: boolean; active?: boolean; indications: string[] };
type ApiMaxSpeed = { speed?: number; unit?: 'km/h' | 'mph'; unknown?: boolean; none?: boolean };
type ApiStep = {
  distance: number;
  duration: number;
  name: string;
  maneuver: { type: string; modifier?: string; instruction: string; location: LngLat };
  intersections?: { location: LngLat; lanes?: ApiLane[]; classes?: string[] }[];
  voiceInstructions?: { distanceAlongGeometry: number; announcement: string }[];
};
export type ApiRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: LngLat[] };
  legs: { distance: number; steps: ApiStep[]; annotation?: { congestion?: string[]; maxspeed?: ApiMaxSpeed[] } }[];
};

const LEVELS = new Set(['low', 'moderate', 'heavy', 'severe']);

export function parseRoute(api: ApiRoute): Route {
  const line = buildLine(api.geometry.coordinates);
  // Our haversine length differs slightly from Mapbox's; scale step distances to match.
  const k = api.distance > 0 ? line.length / api.distance : 1;
  const steps: Step[] = [];
  const lanes: LaneSpot[] = [];
  const legEnds: number[] = [];
  const congestion: Congestion[] = [];
  const speedLimits: (number | null)[] = [];
  let at = 0;
  for (const leg of api.legs) {
    for (const s of leg.steps) {
      const start = at;
      const distance = s.distance * k;
      steps.push({
        start,
        distance,
        duration: s.duration,
        name: s.name,
        maneuver: s.maneuver,
        voice: (s.voiceInstructions ?? []).map((v) => ({
          at: start + Math.max(0, distance - v.distanceAlongGeometry * k),
          text: v.announcement,
        })),
      });
      // Lane data sits on intersections; place each one along the step by its share of the step.
      const ints = s.intersections ?? [];
      ints.forEach((int, i) => {
        if (!int.lanes?.length) return;
        lanes.push({
          at: start + (ints.length > 1 ? (distance * i) / ints.length : 0),
          location: int.location,
          lanes: int.lanes.map((l) => ({ valid: l.valid, active: l.active, indications: l.indications })),
        });
      });
      at += distance;
    }
    legEnds.push(at);
    for (const c of leg.annotation?.congestion ?? []) congestion.push(LEVELS.has(c) ? (c as Congestion) : 'unknown');
    for (const m of leg.annotation?.maxspeed ?? []) speedLimits.push(toMph(m));
  }
  const cruiseMph = api.duration > 0 ? (api.distance / api.duration) * 2.23694 : 0;
  const tolls = api.legs.some((leg) => leg.steps.some((s) => s.intersections?.some((i) => i.classes?.includes('toll'))));
  return { line, distance: line.length, duration: api.duration, steps, lanes, congestion, legEnds, cruiseMph, tolls, speedLimits };
}

function toMph(m: ApiMaxSpeed): number | null {
  if (m.speed == null || m.unknown || m.none) return null;
  return m.unit === 'km/h' ? Math.round(m.speed * 0.621371) : m.speed;
}

/** The posted limit where you are on the route (meters along it), if known. */
export function speedLimitAt(route: Route, along: number): number | null {
  if (!route.speedLimits.length) return null;
  return route.speedLimits[pointAt(route.line, along).index] ?? null;
}

/** Group the route into runs of equal congestion, for drawing a traffic-colored route line. */
export function congestionRuns(route: Route): { level: Congestion; coords: LngLat[] }[] {
  const { coords } = route.line;
  if (route.congestion.length === 0) return [{ level: 'unknown', coords }];
  const runs: { level: Congestion; coords: LngLat[] }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const level = route.congestion[i] ?? 'unknown';
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.coords.push(coords[i + 1]);
    else runs.push({ level, coords: [coords[i], coords[i + 1]] });
  }
  return runs;
}

// ── Long trips ──
// Mapbox turns down a single directions request past its distance limit ("Route exceeds maximum
// distance limitation"). Long trips are routed in pieces (each leg on its own, and a leg that is
// still too long split at a town along the way) and the pieces joined back into one route.

type ApiLeg = ApiRoute['legs'][number];
type Annotation = { congestion: string[]; maxspeed: ApiMaxSpeed[] };

const ARRIVING = /arriv|destination/i;

/** A one-leg route's annotations, padded so there is exactly one entry per line segment. */
function annotationOf(r: ApiRoute): Annotation {
  const segs = Math.max(0, r.geometry.coordinates.length - 1);
  const a = r.legs[0]?.annotation;
  return {
    congestion: a?.congestion?.length === segs ? [...a.congestion] : Array(segs).fill('unknown'),
    maxspeed: a?.maxspeed?.length === segs ? [...a.maxspeed] : Array(segs).fill({ unknown: true }),
  };
}

/** Geometry of b after a, without repeating the shared point; `gap` when they don't meet. */
function appendCoords(a: LngLat[], b: LngLat[]): { coords: LngLat[]; gap: boolean } {
  const last = a.at(-1);
  const first = b[0];
  const same = !!last && !!first && Math.abs(last[0] - first[0]) < 1e-5 && Math.abs(last[1] - first[1]) < 1e-5;
  return { coords: [...a, ...(same ? b.slice(1) : b)], gap: !same && !!last && !!first };
}

/**
 * Two pieces of one leg (a ends where b starts) as a single leg: the arrival at the split point and
 * its "you will arrive" prompts are dropped, and b's "Head north on…" becomes a plain continue.
 */
export function joinPieces(a: ApiRoute, b: ApiRoute): ApiRoute {
  const stepsA = [...(a.legs[0]?.steps ?? [])];
  if (stepsA.at(-1)?.maneuver.type === 'arrive') stepsA.pop();
  const tail = stepsA.at(-1);
  if (tail) stepsA[stepsA.length - 1] = { ...tail, voiceInstructions: tail.voiceInstructions?.filter((v) => !ARRIVING.test(v.announcement)) };
  const stepsB = (b.legs[0]?.steps ?? []).map((s, i) =>
    i === 0 && s.maneuver.type === 'depart'
      ? {
          ...s,
          maneuver: { ...s.maneuver, type: 'continue', modifier: 'straight', instruction: s.name ? `Continue on ${s.name}` : 'Continue' },
          // Drop the "Head north on…" said as the piece starts; keep the prompts further along.
          voiceInstructions: s.voiceInstructions?.filter((v) => v.distanceAlongGeometry < s.distance - 1),
        }
      : s,
  );
  const { coords, gap } = appendCoords(a.geometry.coordinates, b.geometry.coordinates);
  const annA = annotationOf(a);
  const annB = annotationOf(b);
  const pad = gap ? 1 : 0;
  return {
    distance: a.distance + b.distance,
    duration: a.duration + b.duration,
    geometry: { coordinates: coords },
    legs: [
      {
        distance: a.distance + b.distance,
        steps: [...stepsA, ...stepsB],
        annotation: {
          congestion: [...annA.congestion, ...Array(pad).fill('unknown'), ...annB.congestion],
          maxspeed: [...annA.maxspeed, ...Array(pad).fill({ unknown: true }), ...annB.maxspeed],
        },
      },
    ],
  };
}

/** One-leg routes for consecutive legs of a trip (stop to stop) as one multi-leg route. */
export function joinLegs(parts: ApiRoute[]): ApiRoute {
  let coords: LngLat[] = [];
  const legs: ApiLeg[] = [];
  for (const p of parts) {
    const joined = appendCoords(coords, p.geometry.coordinates);
    // A gap between legs is a segment of its own; count it on the leg before.
    const prev = legs.at(-1);
    if (joined.gap && prev?.annotation) {
      prev.annotation.congestion?.push('unknown');
      prev.annotation.maxspeed?.push({ unknown: true });
    }
    coords = joined.coords;
    legs.push({ distance: p.legs[0]?.distance ?? p.distance, steps: p.legs[0]?.steps ?? [], annotation: annotationOf(p) });
  }
  return {
    distance: parts.reduce((s, p) => s + p.distance, 0),
    duration: parts.reduce((s, p) => s + p.duration, 0),
    geometry: { coordinates: coords },
    legs,
  };
}
