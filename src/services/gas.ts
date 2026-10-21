import { FUEL } from '../config';
import { bboxOf, milesToMeters, MI, sliceLine, type Line, type LngLat } from '../core/geo';
import { gasStopWindow } from '../core/fuel';
import { pickGasStop, type GasPick, type Place } from '../core/places';
import type { Route } from '../core/route';
import { hasToken, searchCategory } from './mapbox';
import { cachedGas } from './offline';

export type GasPlan = { pick: GasPick | null; options: GasPick[]; offline: boolean };

/**
 * Find gas along the route 15–30 miles ahead. Searches live when there's signal and falls back to
 * the stations saved for this trip when there isn't.
 */
export async function planGasStop(route: Route, alongMeters: number, rangeMi: number): Promise<GasPlan> {
  const nowMi = alongMeters / MI;
  const win = gasStopWindow(nowMi, rangeMi);
  // Search a little wider than the window so there are fallbacks if the window is empty.
  const from = milesToMeters(Math.max(nowMi + 2, win.fromMi - 10));
  const to = milesToMeters(Math.min(nowMi + rangeMi, win.toMi + 10));
  let stations: Place[] = [];
  let offline = false;
  if (hasToken() && to > from) {
    try {
      stations = await searchCategory('gas', { bbox: bboxOf(sliceLine(route.line, from, to), milesToMeters(FUEL.maxDetourMiles * 2)) }, 25);
    } catch {
      offline = true;
    }
  } else offline = true;
  if (offline || stations.length === 0) {
    const cached = await cachedGas();
    if (cached.length) stations = cached;
  }
  const options = rankAll(stations, route.line, alongMeters, win, rangeMi);
  return { pick: pickGasStop(stations, route.line, alongMeters, win, rangeMi), options, offline };
}

function rankAll(stations: Place[], route: Line, along: number, win: { fromMi: number; toMi: number }, rangeMi: number): GasPick[] {
  // Rank each station on its own, then list window matches first.
  const picks = stations.map((s) => pickGasStop([s], route, along, win, rangeMi)).filter((p): p is GasPick => p != null);
  return picks.sort((a, b) => Number(b.inWindow) - Number(a.inWindow) || a.detourMi - b.detourMi || a.aheadMi - b.aheadMi).slice(0, 12);
}

/** No route? Nearest stations to the driver, for a quick "where's gas" list. */
export async function nearbyGas(at: LngLat): Promise<Place[]> {
  if (!hasToken()) return [];
  return searchCategory('gas', { near: at }, 10);
}
