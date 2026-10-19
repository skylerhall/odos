// Weather logic: what the sky is doing, what that means for the drive, and what's coming up
// along the route. Pure functions; data comes from services/weather.ts.

import { MI, pointAt, type Line, type LngLat } from './geo';
import type { FuelKind } from './vehicles/types';

export type Sky =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavyRain'
  | 'freezing'
  | 'snow'
  | 'heavySnow'
  | 'storm';

export type Condition = {
  sky: Sky;
  label: string;
  /** 0–1, drives how strong the on-map effect is. */
  intensity: number;
  /** Worth warning a driver about. */
  hazard: boolean;
};

/** WMO weather codes (used by Open-Meteo) → a driving-relevant condition. */
export function fromWmo(code: number): Condition {
  const c = (sky: Sky, label: string, intensity: number, hazard = false): Condition => ({ sky, label, intensity, hazard });
  switch (code) {
    case 0:
      return c('clear', 'Clear', 1);
    case 1:
      return c('clear', 'Mostly clear', 0.8);
    case 2:
      return c('partly', 'Partly cloudy', 0.5);
    case 3:
      return c('cloudy', 'Overcast', 0.8);
    case 45:
      return c('fog', 'Fog', 0.7, true);
    case 48:
      return c('fog', 'Freezing fog', 0.9, true);
    case 51:
    case 53:
      return c('drizzle', 'Drizzle', 0.3);
    case 55:
      return c('drizzle', 'Heavy drizzle', 0.45);
    case 56:
    case 57:
    case 66:
    case 67:
      return c('freezing', 'Freezing rain', 0.7, true);
    case 61:
    case 80:
      return c('rain', 'Light rain', 0.4);
    case 63:
    case 81:
      return c('rain', 'Rain', 0.65);
    case 65:
    case 82:
      return c('heavyRain', 'Heavy rain', 1, true);
    case 71:
    case 77:
    case 85:
      return c('snow', 'Light snow', 0.45, true);
    case 73:
      return c('snow', 'Snow', 0.7, true);
    case 75:
    case 86:
      return c('heavySnow', 'Heavy snow', 1, true);
    case 95:
      return c('storm', 'Thunderstorm', 0.9, true);
    case 96:
    case 99:
      return c('storm', 'Thunderstorm with hail', 1, true);
    default:
      return c('cloudy', 'Cloudy', 0.5);
  }
}

export function weatherIcon(sky: Sky, isDay: boolean): string {
  switch (sky) {
    case 'clear':
      return isDay ? '☀️' : '🌙';
    case 'partly':
      return isDay ? '⛅' : '☁️';
    case 'cloudy':
      return '☁️';
    case 'fog':
      return '🌫️';
    case 'drizzle':
      return '🌦️';
    case 'rain':
    case 'heavyRain':
      return '🌧️';
    case 'freezing':
      return '🧊';
    case 'snow':
    case 'heavySnow':
      return '🌨️';
    case 'storm':
      return '⛈️';
  }
}

/** One short line a driver can act on, or null when conditions are fine. */
export function drivingTip(cond: Condition, tempF: number | null, windMph: number | null): string | null {
  if (cond.sky === 'freezing' || (tempF != null && tempF <= 34 && ['rain', 'drizzle', 'heavyRain'].includes(cond.sky)))
    return 'Ice risk. Slow down and leave lots of room.';
  if (cond.sky === 'heavySnow' || cond.sky === 'snow') return 'Snow. Slow down, brake early, gentle steering.';
  if (cond.sky === 'storm') return 'Thunderstorm. Watch for standing water and gusts.';
  if (cond.sky === 'heavyRain') return 'Heavy rain. Hydroplaning risk, ease off the gas.';
  if (cond.sky === 'fog') return 'Fog. Low beams on, increase following distance.';
  if (windMph != null && windMph >= 35) return 'High winds. Tall vehicles take care.';
  if (cond.sky === 'rain' || cond.sky === 'drizzle') return 'Wet roads. Leave extra following distance.';
  return null;
}

/**
 * How much weather cuts fuel economy (1 = no effect). Wet or snowy roads add rolling resistance;
 * cold hurts engines a little and batteries a lot (heating plus battery chemistry).
 */
export function weatherFuelFactor(sky: Sky, tempF: number | null, fuel: FuelKind): number {
  let f = 1;
  if (sky === 'drizzle' || sky === 'rain') f *= 0.97;
  if (sky === 'heavyRain' || sky === 'storm' || sky === 'freezing') f *= 0.94;
  if (sky === 'snow') f *= 0.9;
  if (sky === 'heavySnow') f *= 0.85;
  if (tempF != null) {
    if (fuel === 'ev') {
      if (tempF < 32) f *= 0.75;
      else if (tempF < 50) f *= 0.88;
      else if (tempF > 95) f *= 0.9; // A/C load
    } else if (tempF < 32) f *= 0.95;
  }
  return f;
}

export type RouteSample = { coord: LngLat; aheadMeters: number; etaSeconds: number };

/**
 * Points along the rest of the route to check the forecast at, each with when you'll get there.
 * Every `everyMiles`, up to `max` points.
 */
export function routeSamples(line: Line, alongNow: number, cruiseMph: number, everyMiles = 40, max = 8): RouteSample[] {
  const mps = Math.max(10, cruiseMph * 0.44704);
  const out: RouteSample[] = [];
  for (let ahead = everyMiles * MI; alongNow + ahead < line.length && out.length < max; ahead += everyMiles * MI) {
    out.push({ coord: pointAt(line, alongNow + ahead).coord, aheadMeters: ahead, etaSeconds: ahead / mps });
  }
  const left = line.length - alongNow;
  if (left > 5 * MI && out.length < max) out.push({ coord: line.coords[line.coords.length - 1], aheadMeters: left, etaSeconds: left / mps });
  return out;
}

/** Index of the forecast hour nearest to a moment (times are epoch seconds). */
export function nearestHour(times: number[], atEpoch: number): number {
  let best = 0;
  times.forEach((t, i) => {
    if (Math.abs(t - atEpoch) < Math.abs(times[best] - atEpoch)) best = i;
  });
  return best;
}

export type AheadReport = { aheadMeters: number; etaSeconds: number; cond: Condition; tempF: number | null };

/** The first hazard on the way, if any. */
export function firstHazard(reports: AheadReport[]): AheadReport | null {
  return reports.find((r) => r.cond.hazard) ?? null;
}
