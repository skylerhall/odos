// Mapbox web APIs: routing with live traffic, place search, category search, drive-time matrix.

import { MAPBOX_TOKEN } from '../config';
import type { BBox, LngLat } from '../core/geo';
import type { Place, PlaceKind } from '../core/places';
import { parseRoute, type ApiRoute, type Route } from '../core/route';
import { fetchJson, HttpError, qs } from './http';

const API = 'https://api.mapbox.com';

export function hasToken(): boolean {
  return MAPBOX_TOKEN.startsWith('pk.');
}

export type VehicleLimits = { maxHeightM?: number; maxWidthM?: number; maxWeightT?: number };

/** Mapbox turned the request down (bad input, or no route exists), as opposed to no connection. */
function isRejection(e: unknown): boolean {
  if (e instanceof HttpError) return e.status >= 400 && e.status < 500 && e.status !== 401;
  return e instanceof Error && !(e instanceof TypeError) && e.name !== 'AbortError';
}

/**
 * Route through the given points (start, stops…, destination). Uses the live-traffic profile and
 * asks for lane data, voice prompts and per-segment congestion. Falls back to the plain driving
 * profile if the traffic profile rejects the request (e.g. too many stops). With avoidTolls, asks
 * for toll-free routes; if none exists, returns the normal routes (check Route.tolls).
 */
export async function getRoutes(
  points: LngLat[],
  opts: { limits?: VehicleLimits; heading?: number; avoidTolls?: boolean } = {},
): Promise<Route[]> {
  const path = points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
  const params = {
    access_token: MAPBOX_TOKEN,
    alternatives: points.length === 2,
    geometries: 'geojson',
    overview: 'full',
    steps: true,
    voice_instructions: true,
    voice_units: 'imperial',
    banner_instructions: true,
    annotations: 'congestion,duration,distance',
    // Prefer routes that continue the way we're already pointing (fewer U-turns on reroute).
    bearings: opts.heading != null ? [`${Math.round(opts.heading)},60`, ...points.slice(1).map(() => '')].join(';') : undefined,
    max_height: opts.limits?.maxHeightM,
    max_width: opts.limits?.maxWidthM,
    max_weight: opts.limits?.maxWeightT,
    exclude: opts.avoidTolls ? 'toll' : undefined,
  };
  const call = async (profile: string) => {
    const data = await fetchJson<{ code: string; message?: string; routes: ApiRoute[] }>(
      `${API}/directions/v5/mapbox/${profile}/${path}?${qs(params)}`,
    );
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error(data.message ?? data.code ?? 'No route');
    return data.routes.map(parseRoute);
  };
  const request = async () => {
    try {
      return await call('driving-traffic');
    } catch (e) {
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 401) {
        params.annotations = 'duration,distance'; // congestion only exists on the traffic profile
        return call('driving');
      }
      throw e;
    }
  };
  try {
    return await request();
  } catch (e) {
    if (!params.exclude || !isRejection(e)) throw e;
    // No toll-free way through these points: take the normal route and let the caller say so.
    params.exclude = undefined;
    params.annotations = 'congestion,duration,distance';
    return request();
  }
}

type Feature = {
  geometry: { coordinates: LngLat };
  properties: {
    mapbox_id?: string;
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    address?: string;
  };
};

function toPlace(f: Feature, kind: PlaceKind): Place {
  const p = f.properties;
  const coord = f.geometry.coordinates;
  return {
    id: p.mapbox_id ?? `${kind}:${coord[0].toFixed(5)},${coord[1].toFixed(5)}`,
    name: p.name_preferred ?? p.name ?? p.full_address ?? 'Unnamed place',
    address: p.full_address ?? p.place_formatted ?? p.address,
    coord,
    kind,
    source: 'mapbox',
  };
}

/** Search addresses and places by name, biased to the driver's position. */
export async function searchPlaces(query: string, near?: LngLat): Promise<Place[]> {
  const common = { q: query, access_token: MAPBOX_TOKEN, limit: 8, proximity: near ? `${near[0]},${near[1]}` : undefined };
  try {
    const data = await fetchJson<{ features: Feature[] }>(`${API}/search/searchbox/v1/forward?${qs(common)}`);
    if (data.features?.length) return data.features.map((f) => toPlace(f, 'destination'));
  } catch {}
  const data = await fetchJson<{ features: Feature[] }>(`${API}/search/geocode/v6/forward?${qs(common)}`);
  return (data.features ?? []).map((f) => toPlace(f, 'destination'));
}

/** Mapbox POI categories per ODOS place type. */
export const CATEGORIES: Record<'gas' | 'hotel' | 'camp', string[]> = {
  gas: ['gas_station'],
  hotel: ['hotel', 'motel'],
  camp: ['campground', 'rv_park'],
};

/** Category search near a point or inside a box. Unknown categories are skipped quietly. */
export async function searchCategory(kind: 'gas' | 'hotel' | 'camp', where: { near?: LngLat; bbox?: BBox }, limit = 25): Promise<Place[]> {
  const near = where.near ?? (where.bbox ? center(where.bbox) : undefined);
  const results = await Promise.all(
    CATEGORIES[kind].map(async (cat) => {
      const params = {
        access_token: MAPBOX_TOKEN,
        limit,
        language: 'en',
        proximity: near ? `${near[0]},${near[1]}` : undefined,
        bbox: where.bbox
          ? where.bbox
              .flat()
              .map((n) => n.toFixed(5))
              .join(',')
          : undefined,
      };
      try {
        const data = await fetchJson<{ features: Feature[] }>(`${API}/search/searchbox/v1/category/${cat}?${qs(params)}`);
        return (data.features ?? []).map((f) => toPlace(f, kind));
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return [];
        throw e;
      }
    }),
  );
  return dedupe(results.flat());
}

/** Drive time and distance from one point to many, in batches of 24 (Matrix API limit is 25 points). */
export async function driveTimes(from: LngLat, to: LngLat[]): Promise<{ seconds: number | null; meters: number | null }[]> {
  const out: { seconds: number | null; meters: number | null }[] = [];
  for (let i = 0; i < to.length; i += 24) {
    const batch = to.slice(i, i + 24);
    const path = [from, ...batch].map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
    const data = await fetchJson<{ durations: (number | null)[][]; distances: (number | null)[][] }>(
      `${API}/directions-matrix/v1/mapbox/driving/${path}?${qs({
        access_token: MAPBOX_TOKEN,
        sources: 0,
        annotations: 'duration,distance',
      })}`,
    );
    batch.forEach((_, j) => out.push({ seconds: data.durations[0][j + 1], meters: data.distances[0][j + 1] }));
  }
  return out;
}

const center = (b: BBox): LngLat => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];

export function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = `${p.name.toLowerCase()}|${p.coord[0].toFixed(4)}|${p.coord[1].toFixed(4)}`;
    if (seen.has(key) || seen.has(p.id)) return false;
    seen.add(key);
    seen.add(p.id);
    return true;
  });
}
