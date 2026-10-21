// Trail areas: download the trail network (OpenStreetMap via Overpass) and a topo map around a
// point while there's signal, keep them on the phone, and load them back with none.

import Mapbox from '@rnmapbox/maps';
import { Directory, File, Paths } from 'expo-file-system';
import { STYLE, TRAIL } from '../config';
import { destinationPoint, haversine, milesToMeters, type BBox, type LngLat } from '../core/geo';
import { parseOverpass, trailQuery, type TrailArea } from '../core/trails';
import { fetchJson, OVERPASS_HEADERS } from './http';
import { hasToken } from './mapbox';
import { load, save } from './storage';

/** What the list of downloaded areas shows, without reading each (large) area file. */
export type TrailAreaInfo = Pick<TrailArea, 'id' | 'name' | 'center' | 'radiusM' | 'createdAt'> & { trails: number; places: number; bytes: number };

export type DownloadProgress = { stage: 'trails' | 'map' | 'done'; percent: number };

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const PACK_PREFIX = 'odos-trail-';
const INDEX_KEY = 'trailAreas';

const dir = () => new Directory(Paths.document, 'trails');
const fileFor = (id: string) => new File(dir(), `${id}.json`);

export async function listTrailAreas(): Promise<TrailAreaInfo[]> {
  return load<TrailAreaInfo[]>(INDEX_KEY, []);
}

/** The downloaded area you're in (nearest center first), if any. */
export function areaAt(areas: TrailAreaInfo[], p: LngLat): TrailAreaInfo | null {
  return areas.filter((a) => haversine(a.center, p) <= a.radiusM).sort((a, b) => haversine(a.center, p) - haversine(b.center, p))[0] ?? null;
}

export async function loadTrailArea(id: string): Promise<TrailArea | null> {
  try {
    const f = fileFor(id);
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as TrailArea;
  } catch {
    return null;
  }
}

export async function deleteTrailArea(id: string): Promise<TrailAreaInfo[]> {
  try {
    const f = fileFor(id);
    if (f.exists) f.delete();
  } catch {}
  const packs = await Mapbox.offlineManager.getPacks().catch(() => []);
  await Promise.all(packs.filter((p) => p.name.startsWith(`${PACK_PREFIX}${id}`)).map((p) => Mapbox.offlineManager.deletePack(p.name).catch(() => {})));
  const next = (await listTrailAreas()).filter((a) => a.id !== id);
  await save(INDEX_KEY, next);
  return next;
}

/**
 * Download trails and a topo map within `radiusMi` of `center`. The trail data comes first (it's what
 * routing needs); map tiles keep downloading in the background and report through `onProgress`.
 */
export async function downloadTrailArea(center: LngLat, radiusMi: number, onProgress: (p: DownloadProgress) => void): Promise<TrailAreaInfo[]> {
  const radiusM = milesToMeters(radiusMi);
  const createdAt = Date.now();
  const id = `a${createdAt.toString(36)}`;
  onProgress({ stage: 'trails', percent: 0 });

  let json: Parameters<typeof parseOverpass>[0] | null = null;
  let lastError: unknown = null;
  for (const url of OVERPASS) {
    try {
      json = await fetchJson(url, {
        method: 'POST',
        headers: OVERPASS_HEADERS,
        body: `data=${encodeURIComponent(trailQuery(center, radiusM))}`,
        timeoutMs: 150000,
      });
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!json) throw lastError instanceof Error ? lastError : new Error('Trail download failed');

  const area = parseOverpass(json, { id, name: '', center, radiusM, createdAt });
  if (!area.ways.length) throw new Error('No trails or back roads found here');
  area.name = nameFor(area);
  const text = JSON.stringify(area);
  dir().create({ intermediates: true, idempotent: true });
  await fileFor(id).write(text);
  const info: TrailAreaInfo = { id, name: area.name, center, radiusM, createdAt, trails: area.ways.length, places: area.pois.length, bytes: text.length };
  const areas = [info, ...(await listTrailAreas())];
  await save(INDEX_KEY, areas);

  onProgress({ stage: 'map', percent: 0 });
  if (hasToken()) await saveTopo(id, center, radiusM, radiusMi, (pct) => onProgress({ stage: pct >= 99.5 ? 'done' : 'map', percent: pct }));
  else onProgress({ stage: 'done', percent: 100 });
  return areas;
}

/** Names an area after the closest named trailhead, peak or campsite, else by date. */
function nameFor(a: TrailArea): string {
  const named = a.pois.filter((p) => p.name && !['Trailhead', 'Viewpoint', 'Campsite', 'Water'].includes(p.name));
  const near = named.sort((x, y) => haversine(x.coord, a.center) - haversine(y.coord, a.center))[0];
  const date = new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return near ? `Near ${near.name}` : `Trail area · ${date}`;
}

/** Topo map for the day, and the dark map (less detail) for after sunset. */
async function saveTopo(id: string, center: LngLat, radiusM: number, radiusMi: number, onPercent: (pct: number) => void) {
  const sw = destinationPoint(destinationPoint(center, radiusM, 180), radiusM, 270);
  const ne = destinationPoint(destinationPoint(center, radiusM, 0), radiusM, 90);
  const bounds: BBox = [sw, ne];
  const maxZoom = TRAIL.maxZoom[radiusMi] ?? 15;
  const jobs = [
    { name: `${PACK_PREFIX}${id}-day`, styleURL: STYLE.trail, maxZoom },
    { name: `${PACK_PREFIX}${id}-night`, styleURL: STYLE.night, maxZoom: Math.max(TRAIL.minZoom, maxZoom - 1) },
  ];
  const done = new Map<string, number>();
  Mapbox.offlineManager.setTileCountLimit(100000);
  await Promise.all(
    jobs.map((job) =>
      Mapbox.offlineManager.createPack(
        { name: job.name, styleURL: job.styleURL, bounds, minZoom: TRAIL.minZoom, maxZoom: job.maxZoom },
        (_pack, status) => {
          done.set(job.name, status.percentage);
          onPercent([...done.values()].reduce((s, v) => s + v, 0) / jobs.length);
        },
        () => onPercent(100), // a failed map download still leaves the trails usable
      ),
    ),
  );
}
