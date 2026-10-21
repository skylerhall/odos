// The app's brain: location, routing, turn-by-turn, fuel, auto gas stops, lanes and persistence.
// Screens call the actions returned here; nothing else talks to GPS or the APIs directly.

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Linking, Share } from 'react-native';
import { NAV } from '../config';
import { burn, fullTank, gaugeLabel, outlook, tankAt, type FuelOutlook, type FuelState } from '../core/fuel';
import { haversine, MI, pointAt, type LngLat } from '../core/geo';
import { LaneAdvisor, type LaneAdvice, type LaneGuide } from '../core/lanes';
import { simulateLanes } from '../core/laneSim';
import { NavTracker, type Progress } from '../core/nav';
import { insertStop, type GasPick, type Place, type RestOption, type Stop } from '../core/places';
import type { Route } from '../core/route';
import { formatCoords, shareMessage } from '../core/share';
import type { Vehicle } from '../core/vehicles/types';
import { nearbyGas, planGasStop, type GasPlan } from '../services/gas';
import { getRoutes, hasToken } from '../services/mapbox';
import { searchWhereTo } from '../services/placeSearch';
import {
  addRecent,
  addShortcut as addShortcutTo,
  normalizeShortcuts,
  removeShortcut as removeShortcutFrom,
  setShortcutPlace,
  type Shortcut,
} from '../core/saved';
import { cachedRest, saveCorridor, type OfflineStatus } from '../services/offline';
import { findRest, type RestKind } from '../services/rest';
import { load, save } from '../services/storage';
import { clockIn, duration as fmtDuration, miles as fmtMiles } from '../ui/format';
import { isDark, nextLightChange } from '../core/sun';

export type Settings = {
  voice: boolean;
  /** Dark map and theme. Worked out from sunset/sunrise (see core/sun.ts) unless overridden. */
  night: boolean;
  /** Set by tapping Night: holds until the next sunset or sunrise, then it's automatic again. */
  nightOverride: { night: boolean; until: number } | null;
  traffic: boolean;
  avoidTolls: boolean;
  sim: boolean;
  simSpeed: number;
};
export type Fix = { coord: LngLat; heading: number | null; mph: number; accuracy: number | null; at: number };
export type Toast = { id: number; text: string; tone: 'info' | 'amber' | 'good' | 'danger' };
export type LaneView = {
  count: number;
  guides: LaneGuide[] | null;
  inMeters: number | null;
  advice: LaneAdvice | null;
  simulated: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  voice: true,
  night: false,
  nightOverride: null,
  traffic: true,
  avoidTolls: false,
  sim: false,
  simSpeed: 4,
};
/** Where Sim mode starts when there's no GPS fix yet (downtown Denver). */
const SIM_START: LngLat = [-104.9903, 39.7392];

export function useOdos() {
  const [vehicle, setVehicleState] = useState<Vehicle | null>(null);
  const [fuel, setFuel] = useState<FuelState | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [destination, setDestination] = useState<Place | null>(null);
  // The trip as it was before the first quick change on the road (a new destination or stop picked
  // from the top search bar or a dropped pin), so "Original" can put it back.
  const [original, setOriginal] = useState<{ destination: Place; stops: Stop[] } | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [route, setRoute] = useState<Route | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [routing, setRouting] = useState(false);
  const [gas, setGas] = useState<GasPlan | null>(null);
  const [lanes, setLanes] = useState<LaneView | null>(null);
  const [offline, setOffline] = useState<OfflineStatus>({ state: 'idle', percent: 0 });
  const [toast, setToast] = useState<Toast | null>(null);
  const [pin, setPin] = useState<LngLat | null>(null);
  // Saved on the phone: recent destinations and Home/Work/custom shortcuts.
  const [recents, setRecents] = useState<Place[]>([]);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(() => normalizeShortcuts(null));
  /** MPG multiplier from current weather (rain, snow, cold). Set by useWeather. */
  const [efficiency, setEfficiency] = useState(1);

  // ── automatic night mode ──
  // A one-minute clock, so the map switches at sunset and sunrise even when nothing else changes.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const override = settings.nightOverride;
  const night = override && clock < override.until ? override.night : isDark(new Date(clock), fix?.coord ?? null);
  const effectiveSettings = useMemo(() => ({ ...settings, night }), [settings, night]);

  // Latest values for callbacks that outlive a render (GPS watcher, timers).
  const live = useRef({ vehicle, fuel, settings, fix, destination, stops, route, progress, efficiency });
  useLayoutEffect(() => {
    live.current = { vehicle, fuel, settings: effectiveSettings, fix, destination, stops, route, progress, efficiency };
  });
  const tracker = useRef<NavTracker | null>(null);
  const lastFix = useRef<Fix | null>(null);
  const bufferHandled = useRef(false);
  const simAlong = useRef(0);
  const routeSeq = useRef(0);
  const advisor = useRef(new LaneAdvisor());
  const rerouting = useRef(false);

  // ── feedback ──
  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => setToast({ id: Date.now(), text, tone }), []);
  const speak = useCallback((text: string) => {
    if (live.current.settings.voice) Speech.speak(text, { language: 'en-US' });
  }, []);
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

  // ── persistence ──
  useEffect(() => {
    (async () => {
      const [v, f, s, rec, sc] = await Promise.all([
        load<Vehicle | null>('vehicle', null),
        load<FuelState | null>('fuel', null),
        load<Settings>('settings', DEFAULT_SETTINGS),
        load<Place[]>('recents', []),
        load<Shortcut[] | null>('shortcuts', null),
      ]);
      setVehicleState(v);
      setRecents(Array.isArray(rec) ? rec : []);
      setShortcuts(normalizeShortcuts(sc));
      setFuel(f ?? (v ? fullTank(v) : null));
      setSettings({ ...DEFAULT_SETTINGS, ...s, sim: false });
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (loaded) save('settings', settings);
  }, [settings, loaded]);
  useEffect(() => {
    if (loaded) save('recents', recents);
  }, [recents, loaded]);
  useEffect(() => {
    if (loaded) save('shortcuts', shortcuts);
  }, [shortcuts, loaded]);
  useEffect(() => {
    if (loaded) save('vehicle', vehicle);
  }, [vehicle, loaded]);
  // Fuel changes every GPS fix; write it at most every 20 seconds.
  const lastFuelSave = useRef(0);
  useEffect(() => {
    if (!loaded || !fuel) return;
    if (Date.now() - lastFuelSave.current > 20000 || fuel.milesSinceFill === 0) {
      lastFuelSave.current = Date.now();
      save('fuel', fuel);
    }
  }, [fuel, loaded]);

  // ── routing ──
  const reroute = useCallback(
    async (next: { dest?: Place | null; stops?: Stop[]; avoidTolls?: boolean } = {}): Promise<Route | null> => {
      const dest = next.dest !== undefined ? next.dest : live.current.destination;
      const via = next.stops ?? live.current.stops;
      const avoidTolls = next.avoidTolls ?? live.current.settings.avoidTolls;
      const here = live.current.fix;
      if (!dest) return null;
      if (!hasToken()) {
        notify('Add your Mapbox token to .env to get directions (see README)', 'danger');
        return null;
      }
      const from = here?.coord ?? SIM_START;
      const seq = ++routeSeq.current;
      setRouting(true);
      try {
        const routes = await getRoutes([from, ...via.map((s) => s.coord), dest.coord], {
          heading: here?.heading ?? undefined,
          avoidTolls,
        });
        if (seq !== routeSeq.current) return null; // a newer request superseded this one
        const r = routes[0];
        // Always answer a new trip or a flipped toggle; on automatic reroutes, say it once, not on
        // every reroute along the same toll road.
        const asked = next.dest !== undefined || next.avoidTolls !== undefined;
        if (avoidTolls && r.tolls && (asked || !live.current.route?.tolls)) notify('No toll-free route here, so this route uses tolls', 'danger');
        tracker.current = new NavTracker(r);
        simAlong.current = 0;
        setRoute(r);
        setProgress(null);
        return r;
      } catch (e) {
        if (seq === routeSeq.current) {
          notify(
            live.current.route
              ? 'No signal to reroute. Following the saved route.'
              : `Couldn’t get a route: ${e instanceof Error ? e.message : e}`,
            'danger',
          );
        }
        return null;
      } finally {
        if (seq === routeSeq.current) setRouting(false);
      }
    },
    [notify],
  );

  const navigateTo = useCallback(
    async (place: Place) => {
      tap();
      if (place.kind !== 'custom') setRecents((r) => addRecent(r, place));
      setDestination(place);
      setStops([]);
      setGas(null);
      setPin(null);
      const r = await reroute({ dest: place, stops: [] });
      if (!r) return;
      speak(`Starting route to ${place.name}. ${fmtMiles(r.distance / MI)}, about ${fmtDuration(r.duration)}.`);
      saveCorridor(r, live.current.settings.night, setOffline);
    },
    [reroute, speak],
  );

  const endTrip = useCallback(() => {
    routeSeq.current++;
    tracker.current = null;
    setOriginal(null);
    setDestination(null);
    setStops([]);
    setRoute(null);
    setProgress(null);
    setLanes(null);
    setGas(null);
    setRouting(false);
  }, []);

  /** Call before a quick change on the road; keeps the trip as it was before the first one. */
  const markQuickChange = useCallback(() => {
    const { destination: d, stops: s } = live.current;
    if (!d) return;
    setOriginal((o) => o ?? { destination: d, stops: s.filter((x) => !x.auto) });
  }, []);

  const restoreOriginal = useCallback(async () => {
    const o = original;
    if (!o) return;
    tap();
    setOriginal(null);
    setDestination(o.destination);
    setStops(o.stops);
    setGas(null);
    bufferHandled.current = false; // the fuel monitor re-plans a gas stop if one is due
    notify(`Back to your trip to ${o.destination.name}`, 'good');
    const r = await reroute({ dest: o.destination, stops: o.stops });
    if (r) speak(`Back to your route to ${o.destination.name}.`);
  }, [original, notify, reroute, speak]);

  const addStop = useCallback(
    async (place: Place, auto = false) => {
      tap();
      const { stops: cur, route: r, progress: p } = live.current;
      const next = insertStop(cur, { ...place, auto }, r?.line ?? null, p?.along ?? 0);
      setStops(next);
      if (!live.current.destination) {
        // No trip yet: the stop becomes the destination.
        await navigateTo(place);
        return;
      }
      await reroute({ stops: next });
      if (!auto) {
        setRecents((r) => addRecent(r, place));
        notify(`Added ${place.name} as a stop`, 'good');
      }
    },
    [navigateTo, notify, reroute],
  );

  const removeStop = useCallback(
    async (id: string) => {
      tap();
      const next = live.current.stops.filter((s) => s.id !== id);
      setStops(next);
      await reroute({ stops: next });
    },
    [reroute],
  );

  // ── fuel ──
  const setVehicle = useCallback(
    (v: Vehicle) => {
      tap();
      setVehicleState(v);
      setFuel(fullTank(v));
      bufferHandled.current = false;
      const o = outlook(fullTank(v), v);
      notify(`${v.make} ${v.model}: ${fmtMiles(o.rangeMi)} on a full tank`, 'good');
    },
    [notify],
  );

  const fillUp = useCallback(async () => {
    const v = live.current.vehicle;
    if (!v) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const full = fullTank(v);
    setFuel(full);
    bufferHandled.current = false;
    setGas(null);
    const o = outlook(full, v, { cruiseMph: live.current.route?.cruiseMph, efficiency: live.current.efficiency });
    const msg = `Full tank. ${fmtMiles(o.rangeMi)} of range. Next fuel alert in ${fmtMiles(o.untilAlertMi)}.`;
    notify(msg, 'good');
    speak(msg);
    const kept = live.current.stops.filter((s) => !s.auto);
    if (kept.length !== live.current.stops.length) {
      setStops(kept);
      await reroute({ stops: kept });
    }
  }, [notify, reroute, speak]);

  // Set the tank by hand (e.g. starting on half a tank). Like "Filled up", it drops any auto gas stop
  // planned for the old level; if the new level is low, the fuel monitor plans a fresh one.
  const setFuelLevel = useCallback(
    async (eighths: number) => {
      const v = live.current.vehicle;
      if (!v) return;
      tap();
      const next = tankAt(v, eighths);
      setFuel(next);
      bufferHandled.current = false;
      setGas(null);
      const o = outlook(next, v, { cruiseMph: live.current.route?.cruiseMph, efficiency: live.current.efficiency });
      notify(`${v.fuel === 'ev' ? 'Battery' : 'Tank'} set to ${gaugeLabel(eighths, v.fuel === 'ev')}. ${fmtMiles(o.rangeMi)} of range.`, 'good');
      const kept = live.current.stops.filter((s) => !s.auto);
      if (kept.length !== live.current.stops.length) {
        setStops(kept);
        await reroute({ stops: kept });
      }
    },
    [notify, reroute],
  );

  /** Range for a tank level, for the slider's live preview. */
  const rangeAt = useCallback((eighths: number) => {
    const v = live.current.vehicle;
    if (!v) return 0;
    return outlook(tankAt(v, eighths), v, { cruiseMph: live.current.route?.cruiseMph, efficiency: live.current.efficiency }).rangeMi;
  }, []);

  // ── saved places ──
  const saveShortcut = useCallback(
    (key: string, place: Place) => {
      setShortcuts((list) => setShortcutPlace(list, key, place));
      const label = shortcuts.find((x) => x.key === key)?.label ?? 'Shortcut';
      notify(`${label} saved: ${place.name}`, 'good');
    },
    [shortcuts, notify],
  );
  const removeShortcut = useCallback((key: string) => setShortcuts((list) => removeShortcutFrom(list, key)), []);
  /** Adds an empty custom shortcut and returns its key (null if the list is full or the name blank). */
  const addShortcut = useCallback(
    (label: string): string | null => {
      const res = addShortcutTo(shortcuts, label);
      if (!res) return null;
      setShortcuts(res.list);
      return res.key;
    },
    [shortcuts],
  );
  const clearRecents = useCallback(() => setRecents([]), []);

  const fuelOutlook: FuelOutlook | null =
    vehicle && fuel
      ? outlook(fuel, vehicle, {
          cruiseMph: route?.cruiseMph,
          efficiency,
          remainingMiles: progress ? progress.remainingMeters / MI : route ? route.distance / MI : undefined,
        })
      : null;

  const findGas = useCallback(async (): Promise<GasPlan | null> => {
    const { vehicle: v, fuel: f, route: r, progress: p, fix: here } = live.current;
    const rangeMi = v && f ? outlook(f, v, { cruiseMph: r?.cruiseMph, efficiency: live.current.efficiency }).rangeMi : 60;
    if (r) {
      const plan = await planGasStop(r, p?.along ?? 0, rangeMi);
      setGas(plan);
      return plan;
    }
    if (!here) return null;
    try {
      const near = await nearbyGas(here.coord);
      const options: GasPick[] = near.map((place) => ({
        place,
        aheadMi: haversine(here.coord, place.coord) / MI,
        detourMi: 0,
        inWindow: true,
      }));
      const plan = { pick: options[0] ?? null, options, offline: false };
      setGas(plan);
      return plan;
    } catch {
      notify('No signal to search for gas', 'danger');
      return null;
    }
  }, [notify]);

  // The 50-mile buffer: alert once, then auto-insert a gas stop 15–30 miles ahead.
  useEffect(() => {
    if (!fuelOutlook?.inBuffer || bufferHandled.current) return;
    bufferHandled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    (async () => {
      const plan = await findGas();
      const pick = plan?.pick;
      if (pick && live.current.route) {
        await addStop(pick.place, true);
        const msg = `Fuel range is ${fmtMiles(fuelOutlook.rangeMi)}. Added a gas stop: ${pick.place.name}, ${fmtMiles(pick.aheadMi)} ahead.`;
        notify(msg, 'amber');
        speak(msg);
      } else if (pick) {
        const msg = `Fuel range is ${fmtMiles(fuelOutlook.rangeMi)}. Nearest gas: ${pick.place.name}, ${fmtMiles(pick.aheadMi)} away.`;
        notify(msg, 'amber');
        speak(msg);
      } else {
        const msg = `Fuel range is ${fmtMiles(fuelOutlook.rangeMi)}. No gas found ahead yet. Tap Gas to search.`;
        notify(msg, 'amber');
        speak(msg);
      }
    })();
  }, [fuelOutlook?.inBuffer, fuelOutlook?.rangeMi, addStop, findGas, notify, speak]);

  // ── every GPS fix (real or simulated) ──
  const onFix = useCallback(
    (f: Fix) => {
      const prev = lastFix.current;
      lastFix.current = f;
      setFix(f);
      const { vehicle: v, stops: via } = live.current;

      if (v && prev) {
        const d = haversine(prev.coord, f.coord);
        // Ignore GPS jumps and jitter while parked.
        if (d > 2 && d < 3000 && (f.accuracy == null || f.accuracy < 60)) {
          const eff = live.current.efficiency;
          setFuel((cur) => (cur ? burn(cur, v, d, f.mph, eff) : cur));
        }
      }

      const t = tracker.current;
      if (!t) return;
      const { progress: p, speak: lines } = t.update(f.coord);
      setProgress(p);
      lines.forEach(speak);

      const next = via[0];
      // Reached the next stop: close to it, or already past the end of the first leg
      // (Sim mode can step over a 90 m circle in one tick).
      const pastLeg = p.along >= t.route.legEnds[0] - NAV.arriveMeters && t.route.legEnds.length > 1;
      if (next && (haversine(f.coord, next.coord) < NAV.arriveMeters || pastLeg)) {
        const rest = via.slice(1);
        setStops(rest);
        notify(next.kind === 'gas' ? `At ${next.name}. Tap “I just filled up” when you’re done.` : `Arrived at ${next.name}`, 'good');
        speak(`Arrived at ${next.name}`);
        reroute({ stops: rest });
        return;
      }
      if (p.arrived && via.length === 0) {
        speak(`You have arrived at ${live.current.destination?.name ?? 'your destination'}`);
        notify('You have arrived 🎉', 'good');
        endTrip();
        return;
      }
      if (p.offRoute && !live.current.settings.sim && !rerouting.current) {
        rerouting.current = true;
        speak('Rerouting');
        reroute().finally(() => (rerouting.current = false));
      }
    },
    [endTrip, notify, reroute, speak],
  );

  // ── location source: real GPS, or Sim mode driving the route ──
  const requestLocation = useCallback(async () => {
    const res = await Location.requestForegroundPermissionsAsync();
    if (res.granted) setPermission('granted');
    else {
      setPermission('denied');
      if (!res.canAskAgain) Linking.openSettings();
    }
  }, []);

  useEffect(() => {
    if (!loaded || settings.sim) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const cur = await Location.getForegroundPermissionsAsync();
      let granted = cur.granted;
      if (!granted && cur.canAskAgain) granted = (await Location.requestForegroundPermissionsAsync()).granted;
      if (cancelled) return;
      setPermission(granted ? 'granted' : 'denied');
      if (!granted) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 3 },
        (loc) =>
          onFix({
            coord: [loc.coords.longitude, loc.coords.latitude],
            heading: loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : null,
            mph: Math.max(0, (loc.coords.speed ?? 0) * 2.23694),
            accuracy: loc.coords.accuracy ?? null,
            at: loc.timestamp,
          }),
      );
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [loaded, settings.sim, onFix, permission]);

  useEffect(() => {
    if (!settings.sim) return;
    if (!lastFix.current) onFix({ coord: SIM_START, heading: 0, mph: 0, accuracy: 5, at: Date.now() });
    const id = setInterval(() => {
      const r = live.current.route;
      if (!r) return;
      const mph = Math.max(30, r.cruiseMph || 60);
      simAlong.current = Math.min(r.line.length, simAlong.current + mph * 0.44704 * live.current.settings.simSpeed);
      const p = pointAt(r.line, simAlong.current);
      onFix({ coord: p.coord, heading: p.bearing, mph, accuracy: 5, at: Date.now() });
    }, 1000);
    return () => clearInterval(id);
  }, [settings.sim, onFix]);

  // ── lanes: map guidance always; speed-based advice when lane speeds exist (Sim for now) ──
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const { progress: p, settings: s, route: r, fix: here } = live.current;
      const ahead = p?.lanesAhead ?? null;
      const count = ahead?.lanes.length ?? (s.sim && r ? 3 : 0);
      if (!r || count === 0) {
        setLanes(null);
        return;
      }
      const allowed = ahead?.lanes.map((l) => l.valid);
      if (!s.sim) {
        setLanes({ count, guides: ahead?.lanes ?? null, inMeters: ahead?.inMeters ?? null, advice: null, simulated: false });
        return;
      }
      const obs = simulateLanes(count, Math.max(30, here?.mph ?? 60), (Date.now() - t0) / 1000);
      const advice = advisor.current.update(obs, { allowed });
      setLanes({ count, guides: ahead?.lanes ?? null, inMeters: ahead?.inMeters ?? null, advice, simulated: true });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // ── one-tap share / copy ──
  const shareLocation = useCallback(async () => {
    tap();
    const here = live.current.fix;
    if (!here) return notify('Waiting for GPS…', 'danger');
    const p = live.current.progress;
    await Share.share({
      message: shareMessage(here.coord, {
        destinationName: live.current.destination?.name,
        etaMinutes: p ? p.remainingSeconds / 60 : undefined,
      }),
    });
  }, [notify]);

  const copyCoords = useCallback(async () => {
    tap();
    const here = live.current.fix;
    if (!here) return notify('Waiting for GPS…', 'danger');
    const text = formatCoords(here.coord);
    await Clipboard.setStringAsync(text);
    notify(`Copied ${text}`, 'good');
  }, [notify]);

  const toggle = useCallback(
    (key: 'voice' | 'night' | 'traffic' | 'sim') => {
      tap();
      if (key === 'night') {
        // Manual night/day holds until the next sunset or sunrise; flipping back to what the sun
        // says just returns to automatic.
        const now = new Date();
        const where = live.current.fix?.coord ?? null;
        const want = !live.current.settings.night;
        if (want === isDark(now, where)) {
          setSettings((s) => ({ ...s, nightOverride: null }));
          notify(`${want ? 'Night' : 'Day'} map · automatic`);
        } else {
          const until = nextLightChange(now, where).getTime();
          setSettings((s) => ({ ...s, nightOverride: { night: want, until } }));
          notify(`${want ? 'Night' : 'Day'} map until ${clockIn((until - now.getTime()) / 1000)}, then automatic`);
        }
        return;
      }
      setSettings((s) => ({ ...s, [key]: !s[key] }));
      if (key === 'voice') Speech.stop();
    },
    [notify],
  );

  // Takes effect on the current trip right away, rerouting with or without toll roads.
  const toggleTolls = useCallback(() => {
    tap();
    const avoidTolls = !live.current.settings.avoidTolls;
    setSettings((s) => ({ ...s, avoidTolls }));
    if (live.current.destination) {
      notify(avoidTolls ? 'Avoiding tolls. Rerouting…' : 'Toll roads allowed. Rerouting…');
      void reroute({ avoidTolls });
    } else {
      notify(avoidTolls ? 'Routes will avoid toll roads' : 'Routes may use toll roads');
    }
  }, [notify, reroute]);

  const dismissToast = useCallback(() => setToast(null), []);

  const setSimSpeed = useCallback((simSpeed: number) => setSettings((s) => ({ ...s, simSpeed })), []);

  const searchRest = useCallback(async (point: LngLat, kinds: RestKind[]): Promise<RestOption[]> => {
    return findRest(point, kinds, await cachedRest());
  }, []);

  const search = useCallback((q: string) => searchWhereTo(q, live.current.fix?.coord), []);

  return {
    loaded,
    vehicle,
    fuel,
    fuelOutlook,
    settings: effectiveSettings,
    fix,
    permission,
    destination,
    /** The trip before the first quick change on the road, or null. */
    original,
    recents,
    shortcuts,
    stops,
    route,
    progress,
    routing,
    gas,
    lanes,
    offline,
    toast,
    pin,
    actions: {
      navigateTo,
      endTrip,
      markQuickChange,
      restoreOriginal,
      saveShortcut,
      removeShortcut,
      addShortcut,
      clearRecents,
      addStop,
      removeStop,
      setVehicle,
      fillUp,
      setFuelLevel,
      rangeAt,
      findGas,
      shareLocation,
      copyCoords,
      toggle,
      toggleTolls,
      setSimSpeed,
      searchRest,
      search,
      requestLocation,
      setPin,
      setEfficiency,
      notify,
      speak,
      dismissToast,
    },
  };
}

export type Odos = ReturnType<typeof useOdos>;
