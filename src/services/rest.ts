// Rest finder: hotels, campgrounds and free overnight parking within a 2-hour drive of any point.

import { REST, RIDB_KEY } from '../config';
import { MI, type LngLat } from '../core/geo';
import { estimateDrive, withinRestLimit, type Place, type RestOption } from '../core/places';
import { fetchJson, OVERPASS_HEADERS, qs } from './http';
import { dedupe, driveTimes, hasToken, searchCategory } from './mapbox';

export type RestKind = 'hotel' | 'camp' | 'freepark';

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/**
 * Free places to stop for the night, from OpenStreetMap: rest areas, lots tagged for overnight
 * parking, free campsites (incl. dispersed BLM/USFS sites mapped by the community), truck stops,
 * and Walmart / Cracker Barrel lots (many allow overnight parking; always check with the store).
 */
async function freeParking(at: LngLat, radiusM: number): Promise<Place[]> {
  const r = Math.round(Math.min(radiusM, 80000));
  const a = `(around:${r},${at[1]},${at[0]})`;
  const query = `[out:json][timeout:25];(
    nwr["highway"="rest_area"]${a};
    nwr["amenity"="parking"]["overnight"="yes"]${a};
    nwr["tourism"="camp_site"]["fee"="no"]${a};
    nwr["amenity"="fuel"]["hgv"="yes"]["brand"~"Love's|Pilot|Flying J|TA|Petro",i]${a};
    nwr["brand"~"^Walmart",i]["shop"~"supermarket|department_store"]${a};
    nwr["brand"~"^Cracker Barrel$",i]["amenity"="restaurant"]${a};
  );out center 80;`;
  const data = await fetchJson<{ elements: OsmElement[] }>('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: OVERPASS_HEADERS,
    body: `data=${encodeURIComponent(query)}`,
    timeoutMs: 20000,
  });
  return data.elements.flatMap((el): Place[] => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return [];
    const t = el.tags ?? {};
    let note = 'Free parking';
    if (t.highway === 'rest_area') note = 'Rest area · check posted time limits';
    else if (t.tourism === 'camp_site') note = 'Free campsite';
    else if (t.amenity === 'fuel') note = 'Truck stop · overnight parking common';
    else if (/walmart|cracker barrel/i.test(t.brand ?? '')) note = 'Overnight often OK · ask the manager';
    else if (t.overnight === 'yes') note = 'Overnight parking allowed';
    return [
      {
        id: `osm:${el.type}/${el.id}`,
        name: t.name ?? t.brand ?? (t.highway === 'rest_area' ? 'Rest area' : 'Free parking'),
        coord: [lon, lat],
        kind: t.tourism === 'camp_site' ? 'camp' : 'freepark',
        note,
        source: 'osm',
      },
    ];
  });
}

/** Federal campgrounds (NPS, USFS, BLM, Army Corps) from Recreation.gov. Needs a free RIDB key. */
async function federalCampgrounds(at: LngLat, radiusMi: number): Promise<Place[]> {
  if (!RIDB_KEY) return [];
  type Facility = {
    FacilityID: string;
    FacilityName: string;
    FacilityLatitude: number;
    FacilityLongitude: number;
    FacilityTypeDescription?: string;
  };
  const data = await fetchJson<{ RECDATA: Facility[] }>(
    `https://ridb.recreation.gov/api/v1/facilities?${qs({ latitude: at[1], longitude: at[0], radius: Math.round(radiusMi), activity: 9, limit: 50 })}`,
    { headers: { apikey: RIDB_KEY, accept: 'application/json' } },
  );
  return (data.RECDATA ?? [])
    .filter((f) => f.FacilityLatitude && f.FacilityLongitude)
    .map((f) => ({
      id: `ridb:${f.FacilityID}`,
      name: titleCase(f.FacilityName),
      coord: [f.FacilityLongitude, f.FacilityLatitude] as LngLat,
      kind: 'camp' as const,
      note: f.FacilityTypeDescription ? `Federal · ${f.FacilityTypeDescription}` : 'Federal campground',
      source: 'ridb' as const,
    }));
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Everything of the requested kinds within a 2-hour drive of `point`, nearest first. Drive times
 * come from Mapbox when online; offline they're estimated from distance and marked as such.
 */
export async function findRest(point: LngLat, kinds: RestKind[], cached: Place[] = []): Promise<RestOption[]> {
  const radiusM = REST.searchRadiusMiles * MI;
  const jobs: Promise<Place[]>[] = [];
  if (hasToken() && kinds.includes('hotel')) jobs.push(searchCategory('hotel', { near: point }, 25));
  if (hasToken() && kinds.includes('camp')) jobs.push(searchCategory('camp', { near: point }, 25));
  if (kinds.includes('camp')) jobs.push(federalCampgrounds(point, REST.searchRadiusMiles));
  if (kinds.includes('freepark') || kinds.includes('camp')) jobs.push(freeParking(point, radiusM));
  const settled = await Promise.allSettled(jobs);
  let places = dedupe(settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : [])));
  const online = settled.some((s) => s.status === 'fulfilled');
  if (!online) places = cached; // no signal: use what was saved along the route
  places = places.filter((p) => kinds.includes(p.kind as RestKind));
  if (places.length === 0) return [];

  let timed: RestOption[];
  try {
    if (!online || !hasToken()) throw new Error('offline');
    const times = await driveTimes(
      point,
      places.map((p) => p.coord),
    );
    timed = places.map((p, i) => {
      const t = times[i];
      if (t?.seconds == null) {
        const e = estimateDrive(point, p.coord);
        return { ...p, driveSeconds: e.seconds, miles: e.miles, estimated: true };
      }
      return { ...p, driveSeconds: t.seconds, miles: (t.meters ?? 0) / MI, estimated: false };
    });
  } catch {
    timed = places.map((p) => {
      const e = estimateDrive(point, p.coord);
      return { ...p, driveSeconds: e.seconds, miles: e.miles, estimated: true };
    });
  }
  return withinRestLimit(timed);
}
