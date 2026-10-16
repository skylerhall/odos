// Offline corridor: when a trip starts, save map tiles and places along the whole route so the
// map, the 50-mile fuel alert and the gas/rest pickers keep working with no signal.

import Mapbox from '@rnmapbox/maps';
import { OFFLINE, STYLE } from '../config';
import { corridorBoxes, milesToMeters, type BBox } from '../core/geo';
import type { Place } from '../core/places';
import type { Route } from '../core/route';
import { dedupe, hasToken, searchCategory } from './mapbox';
import { load, save } from './storage';

const PREFIX = 'odos-trip-';

export type OfflineStatus = { state: 'idle' | 'saving' | 'ready' | 'error'; percent: number; message?: string };

/** Remove tile packs from earlier trips so storage doesn't grow without bound. */
async function clearOldPacks() {
  const packs = await Mapbox.offlineManager.getPacks();
  await Promise.all(packs.filter((p) => p.name.startsWith(PREFIX)).map((p) => Mapbox.offlineManager.deletePack(p.name)));
}

export async function saveCorridor(route: Route, night: boolean, onStatus: (s: OfflineStatus) => void): Promise<void> {
  if (!hasToken()) return;
  onStatus({ state: 'saving', percent: 0 });
  try {
    await clearOldPacks();
    Mapbox.offlineManager.setTileCountLimit(100000);
    const chunk = milesToMeters(OFFLINE.chunkMiles);
    const tiers: { boxes: BBox[]; zoom: readonly [number, number] }[] = [
      { boxes: corridorBoxes(route.line, chunk, milesToMeters(OFFLINE.wideBufferMiles)), zoom: OFFLINE.wideZoom },
      { boxes: corridorBoxes(route.line, chunk, milesToMeters(OFFLINE.nearBufferMiles)), zoom: OFFLINE.nearZoom },
    ];
    const jobs = tiers.flatMap((t, ti) => t.boxes.map((b, bi) => ({ name: `${PREFIX}${ti}-${bi}`, bounds: b, zoom: t.zoom })));
    const done = new Map<string, number>();
    const report = () => {
      const pct = [...done.values()].reduce((a, b) => a + b, 0) / jobs.length;
      onStatus({ state: pct >= 99.5 ? 'ready' : 'saving', percent: Math.round(pct) });
    };
    // Packs download in the background; progress callbacks keep the status chip current.
    for (const job of jobs) {
      await Mapbox.offlineManager.createPack(
        {
          name: job.name,
          styleURL: night ? STYLE.night : STYLE.day,
          bounds: job.bounds,
          minZoom: job.zoom[0],
          maxZoom: job.zoom[1],
        },
        (_pack, status) => {
          done.set(job.name, status.percentage);
          report();
        },
        (_pack, err) => onStatus({ state: 'error', percent: 0, message: err.message }),
      );
    }
    await cachePlacesAlong(route);
  } catch (e) {
    onStatus({ state: 'error', percent: 0, message: e instanceof Error ? e.message : String(e) });
  }
}

/** Fetch gas stations, hotels and campgrounds along the route and keep them on the phone. */
async function cachePlacesAlong(route: Route) {
  const boxes = corridorBoxes(route.line, milesToMeters(OFFLINE.chunkMiles), milesToMeters(3));
  const gas: Place[] = [];
  const rest: Place[] = [];
  for (const bbox of boxes) {
    const [g, h, c] = await Promise.allSettled([
      searchCategory('gas', { bbox }, 25),
      searchCategory('hotel', { bbox }, 10),
      searchCategory('camp', { bbox }, 10),
    ]);
    if (g.status === 'fulfilled') gas.push(...g.value);
    if (h.status === 'fulfilled') rest.push(...h.value);
    if (c.status === 'fulfilled') rest.push(...c.value);
  }
  await save('cache:gas', dedupe(gas));
  await save('cache:rest', dedupe(rest));
}

export const cachedGas = () => load<Place[]>('cache:gas', []);
export const cachedRest = () => load<Place[]>('cache:rest', []);
