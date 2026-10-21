// Turns a Mapbox Directions API route into the shape the app navigates with.

import { buildLine, type Line, type LngLat } from './geo';
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
};

// Minimal typing for the parts of the Directions API response we read.
type ApiLane = { valid: boolean; active?: boolean; indications: string[] };
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
  legs: { distance: number; steps: ApiStep[]; annotation?: { congestion?: string[] } }[];
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
  }
  const cruiseMph = api.duration > 0 ? (api.distance / api.duration) * 2.23694 : 0;
  const tolls = api.legs.some((leg) => leg.steps.some((s) => s.intersections?.some((i) => i.classes?.includes('toll'))));
  return { line, distance: line.length, duration: api.duration, steps, lanes, congestion, legEnds, cruiseMph, tolls };
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
