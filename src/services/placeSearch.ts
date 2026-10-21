// "Where to?" search: a kind of place near you ("nearest gas station") or a normal place/address search.

import { haversine, type LngLat } from '../core/geo';
import type { Place } from '../core/places';
import { parseSearch } from '../core/search';
import { driveTimes, searchCategories, searchPlaces } from './mapbox';

export type SearchResult = Place & { driveSeconds?: number; meters?: number };
export type SearchResponse = { heading: string | null; places: SearchResult[] };

/** How many nearby candidates get a drive-time lookup (one Matrix call). */
const MAX_RANKED = 12;

export async function searchWhereTo(query: string, near?: LngLat): Promise<SearchResponse> {
  const parsed = parseSearch(query);
  if (parsed.nearby) {
    if (!near) {
      return { heading: `Turn on location to find the nearest ${parsed.nearby.label}`, places: await searchPlaces(parsed.text) };
    }
    const found = await searchCategories(parsed.nearby.categories, parsed.nearby.kind, { near }, 10);
    if (found.length) return { heading: `Nearest ${parsed.nearby.label}`, places: await rankByDrive(near, found) };
    // Category came back empty (unknown to Mapbox here, or nothing around): try it as text.
    return { heading: null, places: await rankByDrive(near, await searchPlaces(parsed.text, near)) };
  }
  const places = await searchPlaces(parsed.nearest ? parsed.text : query.trim(), near);
  if (parsed.nearest && near) return { heading: 'Nearest first', places: await rankByDrive(near, places) };
  return { heading: null, places };
}

/** Sort by drive time from `from`; without a connection to the Matrix API, by straight-line distance. */
async function rankByDrive(from: LngLat, places: Place[]): Promise<SearchResult[]> {
  const byLine = places
    .map((p) => ({ ...p, meters: haversine(from, p.coord) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, MAX_RANKED);
  if (!byLine.length) return byLine;
  try {
    const times = await driveTimes(
      from,
      byLine.map((p) => p.coord),
    );
    return byLine
      .map((p, i) => ({ ...p, driveSeconds: times[i].seconds ?? undefined, meters: times[i].meters ?? p.meters }))
      .sort((a, b) => (a.driveSeconds ?? Infinity) - (b.driveSeconds ?? Infinity) || a.meters - b.meters);
  } catch {
    return byLine;
  }
}
