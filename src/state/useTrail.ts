// Trail Mode: downloaded trail areas, the on/off switch between on foot and off-road, routing on
// trails with no signal, the breadcrumb track and back-to-start, and dead-end/gate warnings.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TRAIL } from '../config';
import { MI } from '../core/geo';
import type { Place } from '../core/places';
import type { Route } from '../core/route';
import {
  buildGraph,
  compassTo,
  extendTrack,
  lookAhead,
  newTrack,
  retraceRoute,
  routeOnTrails,
  trailLines,
  type LookAhead,
  type Track,
  type TrailArea,
  type TrailMode,
  type TrailPoi,
} from '../core/trails';
import { load, save } from '../services/storage';
import { areaAt, deleteTrailArea, downloadTrailArea, listTrailAreas, loadTrailArea, type DownloadProgress, type TrailAreaInfo } from '../services/trails';
import type { Fix } from './useOdos';

type Actions = {
  setTrailRouter: (r: { route: (points: Fix['coord'][]) => Route | null; burnFuel: boolean } | null) => void;
  subscribeFix: (cb: (f: Fix) => void) => () => void;
  followRoute: (r: Route, dest: Place) => void;
  navigateTo: (p: Place) => Promise<void>;
  endTrip: () => void;
  speak: (s: string) => void;
  notify: (s: string, tone?: 'info' | 'amber' | 'good' | 'danger') => void;
};

/** Breadcrumb points with worse GPS accuracy than this are skipped (meters). */
const TRACK_MAX_ACCURACY = 35;
const TRACK_SAVE_EVERY_MS = 30000;
/** Reopening the app within this long after closing it mid-trail picks Trail Mode back up. */
const RESUME_WITHIN_MS = 24 * 3600 * 1000;

export function useTrail(opts: { fix: Fix | null; destination: Place | null; route: Route | null; actions: Actions }) {
  const { fix, destination, route, actions: a } = opts;
  const [areas, setAreas] = useState<TrailAreaInfo[]>([]);
  const [mode, setModeState] = useState<TrailMode>('hike');
  const [active, setActive] = useState(false);
  const [area, setArea] = useState<TrailArea | null>(null);
  const [track, setTrack] = useState<Track>(() => newTrack());
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const live = useRef({ a, mode, track, destination });
  useLayoutEffect(() => {
    live.current = { a, mode, track, destination };
  });

  // Saved areas and the last mode; resume Trail Mode (and its track) if the app was closed in it.
  useEffect(() => {
    (async () => {
      const [list, m, saved] = await Promise.all([
        listTrailAreas(),
        load<TrailMode>('trailMode', 'hike'),
        load<{ areaId: string; track: Track } | null>('trailSession', null),
      ]);
      setAreas(list);
      setModeState(m === 'offroad' ? 'offroad' : 'hike');
      if (saved && Date.now() - saved.track.startedAt < RESUME_WITHIN_MS && list.some((x) => x.id === saved.areaId)) {
        const loaded = await loadTrailArea(saved.areaId);
        if (loaded) {
          setArea(loaded);
          setTrack(saved.track);
          setActive(true);
        }
      }
    })();
  }, []);

  const graph = useMemo(() => (active && area ? buildGraph(area, mode) : null), [active, area, mode]);

  // Hand the trail router to navigation while Trail Mode is on. Off-road driving still burns fuel.
  // After a mode switch mid-route, re-plan once the new network is in place.
  const replan = useRef(false);
  useEffect(() => {
    live.current.a.setTrailRouter(
      graph ? { route: (pts) => routeOnTrails(graph, pts[0], pts[pts.length - 1]), burnFuel: mode === 'offroad' } : null,
    );
    const dest = live.current.destination;
    if (replan.current && graph && dest) live.current.a.navigateTo(dest);
    replan.current = false;
  }, [graph, mode]);
  useEffect(() => () => live.current.a.setTrailRouter(null), []);

  // Breadcrumbs: every good GPS fix while Trail Mode is on.
  useEffect(() => {
    if (!active) return;
    return live.current.a.subscribeFix((f) => {
      if (f.accuracy != null && f.accuracy > TRACK_MAX_ACCURACY) return;
      setTrack((t) => extendTrack(t, f.coord));
    });
  }, [active]);
  const lastTrackSave = useRef(0);
  useEffect(() => {
    if (!active || !area) return;
    if (Date.now() - lastTrackSave.current < TRACK_SAVE_EVERY_MS && track.coords.length > 1) return;
    lastTrackSave.current = Date.now();
    save('trailSession', { areaId: area.id, track });
  }, [active, area, track]);

  // Dead ends and gates on the trail ahead (when you're moving and not following a route).
  const ahead: LookAhead | null = useMemo(() => {
    if (!graph || !fix || fix.heading == null || fix.mph < 0.8) return null;
    return lookAhead(graph, fix.coord, fix.heading, TRAIL.warnMeters[mode]);
  }, [graph, fix, mode]);
  const warned = useRef('');
  useEffect(() => {
    if (!ahead || route) return;
    // One warning per feature: key on the rounded distance band so a new dead end warns again.
    const key = ahead.deadEndM != null ? `dead:${Math.round(ahead.deadEndM / 500)}` : ahead.gateM != null ? `gate:${Math.round(ahead.gateM / 500)}` : '';
    if (!key || key === warned.current) return;
    warned.current = key;
    if (ahead.deadEndM != null) live.current.a.speak(`Dead end ahead in ${spokenDistance(ahead.deadEndM)}`);
    else if (ahead.gateM != null) live.current.a.speak(`Gate ahead in ${spokenDistance(ahead.gateM)}`);
  }, [ahead, route]);

  /** Straight-line pointer to the destination when there's no trail route to it. */
  const compass = useMemo(
    () => (active && destination && !route && fix ? compassTo(fix.coord, destination.coord) : null),
    [active, destination, route, fix],
  );

  const lines = useMemo(() => (graph ? toGeoJSON(trailLines(graph)) : null), [graph]);
  const here = fix ? areaAt(areas, fix.coord) : null;

  const start = useCallback(
    async (info: TrailAreaInfo) => {
      const loaded = await loadTrailArea(info.id);
      if (!loaded) return live.current.a.notify('That trail area is missing. Download it again.', 'danger');
      setArea(loaded);
      setTrack(newTrack());
      setActive(true);
      live.current.a.notify(`Trail Mode on · ${live.current.mode === 'hike' ? 'on foot' : 'off-road'}. Recording your track.`, 'good');
      live.current.a.speak('Trail Mode on. Recording your track.');
    },
    [],
  );

  const stop = useCallback(() => {
    setActive(false);
    setArea(null);
    save('trailSession', null);
    live.current.a.endTrip();
    const mi = live.current.track.meters / MI;
    live.current.a.notify(`Trail Mode off · ${mi.toFixed(1)} mi tracked`, 'info');
  }, []);

  const setMode = useCallback((m: TrailMode) => {
    setModeState(m);
    save('trailMode', m);
    replan.current = true;
  }, []);

  const downloadHere = useCallback(async (radiusMi: number) => {
    const at = opts.fix?.coord;
    if (!at) return live.current.a.notify('Waiting for GPS to download the area around you', 'danger');
    setDownloadError(null);
    setDownload({ stage: 'trails', percent: 0 });
    try {
      const list = await downloadTrailArea(at, radiusMi, setDownload);
      setAreas(list);
      live.current.a.notify(`Trails saved for ${radiusMi} miles around you`, 'good');
    } catch (e) {
      setDownload(null);
      setDownloadError(e instanceof Error ? e.message : String(e));
    }
  }, [opts.fix?.coord]);

  const remove = useCallback(async (id: string) => setAreas(await deleteTrailArea(id)), []);

  const backToStart = useCallback(() => {
    const t = live.current.track;
    const r = retraceRoute(t, live.current.mode);
    if (!r) return live.current.a.notify('No track yet. Walk or drive a little first.', 'danger');
    live.current.a.followRoute(r, { id: 'trail-start', name: 'your start', coord: t.coords[0], kind: 'custom' });
  }, []);

  const goTo = useCallback((p: TrailPoi) => {
    live.current.a.navigateTo({ id: `poi:${p.coord.join(',')}`, name: p.name, coord: p.coord, kind: 'custom' });
  }, []);

  return {
    areas,
    /** The downloaded area you're standing in, if any. */
    here,
    mode,
    active,
    area,
    track,
    download,
    downloadError,
    ahead,
    compass,
    lines,
    start,
    stop,
    setMode,
    downloadHere,
    remove,
    backToStart,
    goTo,
  };
}

export type TrailState = ReturnType<typeof useTrail>;

function spokenDistance(m: number): string {
  if (m < 300) return `${Math.max(50, Math.round((m * 3.28084) / 50) * 50)} feet`;
  const mi = m / MI;
  return mi < 0.75 ? 'half a mile' : `${mi.toFixed(1).replace(/\.0$/, '')} miles`;
}

function toGeoJSON(lines: ReturnType<typeof trailLines>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines.map((l) => ({
      type: 'Feature',
      properties: { kind: l.hw === 'track' ? (l.fourWd || (l.grade ?? 0) >= 4 ? 'rough' : 'track') : ['path', 'footway', 'bridleway', 'steps', 'cycleway'].includes(l.hw) ? 'path' : 'road' },
      geometry: { type: 'LineString', coordinates: l.coords },
    })),
  };
}
