// Weather for the drive: conditions here, the forecast along the route for when you'll get there,
// and official alerts. Speaks each new hazard once and feeds a weather factor into the fuel model.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { haversine, MI } from '../core/geo';
import type { Progress } from '../core/nav';
import type { Route } from '../core/route';
import type { FuelKind } from '../core/vehicles/types';
import {
  drivingTip,
  firstHazard,
  routeSamples,
  weatherFuelFactor,
  weatherIcon,
  type AheadReport,
  type Condition,
  type Sky,
} from '../core/weather';
import { load, save } from '../services/storage';
import { currentWeather, nwsAlerts, weatherAlongRoute, type Current, type WeatherAlert } from '../services/weather';
import type { Fix } from './useOdos';

const CURRENT_EVERY_MS = 10 * 60 * 1000;
const AHEAD_EVERY_MS = 15 * 60 * 1000;
const REFETCH_AFTER_METERS = 15000;

/** Conditions used by the "Preview effect" chips, so every effect can be seen on demand. */
const PREVIEW: Record<Sky, Condition> = {
  clear: { sky: 'clear', label: 'Clear', intensity: 1, hazard: false },
  partly: { sky: 'partly', label: 'Partly cloudy', intensity: 0.5, hazard: false },
  cloudy: { sky: 'cloudy', label: 'Overcast', intensity: 0.8, hazard: false },
  fog: { sky: 'fog', label: 'Fog', intensity: 0.7, hazard: true },
  drizzle: { sky: 'drizzle', label: 'Drizzle', intensity: 0.3, hazard: false },
  rain: { sky: 'rain', label: 'Rain', intensity: 0.65, hazard: false },
  heavyRain: { sky: 'heavyRain', label: 'Heavy rain', intensity: 1, hazard: true },
  freezing: { sky: 'freezing', label: 'Freezing rain', intensity: 0.7, hazard: true },
  snow: { sky: 'snow', label: 'Snow', intensity: 0.7, hazard: true },
  heavySnow: { sky: 'heavySnow', label: 'Heavy snow', intensity: 1, hazard: true },
  storm: { sky: 'storm', label: 'Thunderstorm', intensity: 0.9, hazard: true },
};

export function useWeather(opts: {
  fix: Fix | null;
  route: Route | null;
  progress: Progress | null;
  fuelKind: FuelKind | null;
  speak: (s: string) => void;
  notify: (s: string, tone?: 'info' | 'amber' | 'good' | 'danger') => void;
}) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [ahead, setAhead] = useState<AheadReport[]>([]);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [preview, setPreview] = useState<Sky | null>(null);
  const [fx, setFx] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  const live = useRef(opts);
  useLayoutEffect(() => {
    live.current = opts;
  });
  const fetchedAt = useRef<{ coord: [number, number]; at: number } | null>(null);
  const announced = useRef(new Set<string>());

  useEffect(() => {
    load<boolean>('weatherFx', true).then(setFx);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const toggleFx = () => {
    setFx(!fx);
    save('weatherFx', !fx);
  };

  // ── conditions where you are + official alerts ──
  const refreshHere = useCallback(async () => {
    const here = live.current.fix;
    if (!here) return;
    fetchedAt.current = { coord: here.coord, at: Date.now() };
    try {
      setCurrent(await currentWeather(here.coord));
    } catch {}
    try {
      const list = await nwsAlerts(here.coord);
      setAlerts(list);
      for (const a of list) {
        if (announced.current.has(a.id)) continue;
        announced.current.add(a.id);
        live.current.notify(`⚠️ ${a.headline}`, 'amber');
        live.current.speak(`Weather alert: ${a.event}`);
      }
    } catch {}
  }, []);

  // Refresh when the first fix arrives, after moving ~10 miles, and every 10 minutes.
  const fixCoord = opts.fix?.coord;
  useEffect(() => {
    if (!fixCoord) return;
    const last = fetchedAt.current;
    if (!last || haversine(last.coord, fixCoord) > REFETCH_AFTER_METERS || Date.now() - last.at > CURRENT_EVERY_MS) refreshHere();
  }, [fixCoord, refreshHere]);
  useEffect(() => {
    const id = setInterval(refreshHere, CURRENT_EVERY_MS);
    return () => clearInterval(id);
  }, [refreshHere]);

  // ── forecast along the route, for the hour you'll reach each point ──
  const refreshAhead = useCallback(async () => {
    const { route: r, progress } = live.current;
    if (!r) return setAhead([]);
    try {
      const reports = await weatherAlongRoute(routeSamples(r.line, progress?.along ?? 0, r.cruiseMph || 55));
      setAhead(reports);
      const hz = firstHazard(reports);
      if (hz) {
        const key = `${r.line.length.toFixed(0)}:${hz.cond.sky}`;
        if (!announced.current.has(key)) {
          announced.current.add(key);
          const mi = Math.round(hz.aheadMeters / MI);
          live.current.notify(`${weatherIcon(hz.cond.sky, true)} ${hz.cond.label} ahead in ~${mi} mi`, 'amber');
          live.current.speak(`Heads up. ${hz.cond.label} on your route in about ${mi} miles.`);
        }
      }
    } catch {}
  }, []);
  const { route } = opts;
  useEffect(() => {
    refreshAhead();
    if (!route) return;
    const id = setInterval(refreshAhead, AHEAD_EVERY_MS);
    return () => clearInterval(id);
  }, [route, refreshAhead]);

  const shown = preview ? PREVIEW[preview] : current?.cond ?? null;
  const isDay = current?.isDay ?? true;
  const fuelFactor = useMemo(
    () => (current && opts.fuelKind ? weatherFuelFactor(current.cond.sky, current.tempF, opts.fuelKind) : 1),
    [current, opts.fuelKind],
  );

  return {
    current,
    ahead,
    alerts,
    /** Condition the UI shows: the live one, or the effect being previewed. */
    shown,
    isDay,
    previewing: preview,
    setPreview,
    /** Animated effects on (and the OS isn't asking for reduced motion). */
    fxOn: fx && !reduceMotion,
    fx,
    reduceMotion,
    toggleFx,
    fuelFactor,
    tip: shown ? drivingTip(shown, preview ? null : current?.tempF ?? null, preview ? null : current?.windMph ?? null) : null,
    refresh: () => {
      refreshHere();
      refreshAhead();
    },
  };
}

export type WeatherState = ReturnType<typeof useWeather>;
