import { FUEL, REST } from '../config';
import { haversine, MI, snapToLine, type Line, type LngLat } from './geo';

export type PlaceKind = 'gas' | 'hotel' | 'camp' | 'freepark' | 'destination' | 'custom';

export type Place = {
  id: string;
  name: string;
  coord: LngLat;
  kind: PlaceKind;
  address?: string;
  /** Short qualifier shown under the name, e.g. "Rest area" or "Ask the manager before staying". */
  note?: string;
  source?: 'mapbox' | 'osm' | 'ridb';
};

export type Stop = Place & {
  /** True when ODOS added the stop itself (the auto gas stop). */
  auto?: boolean;
};

export type GasPick = {
  place: Place;
  /** Miles from the current position, along the route. */
  aheadMi: number;
  /** How far off the route line the station sits, miles. */
  detourMi: number;
  /** False when nothing was in the 15–30 mile window and ODOS fell back to the best reachable option. */
  inWindow: boolean;
};

/**
 * Pick the gas station to auto-insert. Prefers stations 15–30 miles ahead that sit right on the
 * route; if none, falls back to the closest-to-route station the tank can still reach.
 */
export function pickGasStop(
  stations: Place[],
  route: Line,
  currentAlongMeters: number,
  window: { fromMi: number; toMi: number },
  rangeMi: number,
): GasPick | null {
  const nowMi = currentAlongMeters / MI;
  const candidates: GasPick[] = [];
  for (const place of stations) {
    const snap = snapToLine(route, place.coord);
    const atMi = snap.along / MI;
    const detourMi = snap.offset / MI;
    const aheadMi = atMi - nowMi;
    if (aheadMi <= 1 || detourMi > FUEL.maxDetourMiles * 3) continue; // behind us or far off-route
    if (aheadMi + detourMi > rangeMi - 3) continue; // can't reliably reach it
    candidates.push({ place, aheadMi, detourMi, inWindow: atMi >= window.fromMi && atMi <= window.toMi });
  }
  if (candidates.length === 0) return null;
  const onRoute = (c: GasPick) => c.detourMi <= FUEL.maxDetourMiles;
  const inWin = candidates.filter((c) => c.inWindow && onRoute(c));
  const pool = inWin.length ? inWin : candidates;
  // Smallest detour wins; among near-equal detours, the one closest to the middle of the window.
  const mid = (window.fromMi + window.toMi) / 2 - nowMi;
  pool.sort((a, b) => a.detourMi - b.detourMi || Math.abs(a.aheadMi - mid) - Math.abs(b.aheadMi - mid));
  const best = pool[0];
  return { ...best, inWindow: inWin.length > 0 };
}

/** Put a new stop in the right order: sorted by where each stop falls along the current route. */
export function insertStop(stops: Stop[], stop: Stop, route: Line | null, currentAlongMeters = 0): Stop[] {
  if (stops.some((s) => s.id === stop.id)) return stops;
  if (!route) return [...stops, stop];
  const pos = (s: Stop) => {
    const snap = snapToLine(route, s.coord);
    // Stops far from the route (picked for the night, say) go where they are closest to it.
    return snap.along < currentAlongMeters ? currentAlongMeters : snap.along;
  };
  return [...stops, stop].sort((a, b) => pos(a) - pos(b));
}

export type RestOption = Place & {
  /** Drive time from the chosen stopping point, seconds. */
  driveSeconds: number;
  /** Miles by road (or straight-line when offline). */
  miles: number;
  /** True when drive time is a straight-line estimate because there was no connection. */
  estimated: boolean;
};

/** Offline fallback: approximate drive time from straight-line distance (roads wind ~25%; ~50 mph). */
export function estimateDrive(from: LngLat, to: LngLat): { seconds: number; miles: number } {
  const miles = (haversine(from, to) / MI) * 1.25;
  return { seconds: (miles / 50) * 3600, miles };
}

/** Keep options within the 2-hour limit, nearest first. */
export function withinRestLimit(options: RestOption[]): RestOption[] {
  const max = REST.maxDriveHours * 3600;
  return options.filter((o) => o.driveSeconds <= max).sort((a, b) => a.driveSeconds - b.driveSeconds);
}
