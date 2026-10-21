// When it's dark outside, for the automatic night map. Uses the sun's height at your position, so it
// follows sunset and sunrise through the seasons and across time zones with no network.

import type { LngLat } from './geo';

const RAD = Math.PI / 180;
/** Sun this far below the horizon (degrees) counts as dark: sunset, by the usual definition. */
const DARK_BELOW = -0.833;
/** Without a GPS fix, fall back to the phone's clock (its own time zone): dark from 7 pm to 7 am. */
const FALLBACK_DARK_FROM = 19;
const FALLBACK_DARK_UNTIL = 7;

/** The sun's elevation above the horizon in degrees (approximate, within about half a degree). */
export function sunElevation(date: Date, lat: number, lon: number): number {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24;
  const hourAngle = (gmstHours * 15 + lon) * RAD - ra;
  const el = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(hourAngle));
  return el / RAD;
}

export function isDark(date: Date, where: LngLat | null): boolean {
  if (where) return sunElevation(date, where[1], where[0]) < DARK_BELOW;
  const h = date.getHours();
  return h >= FALLBACK_DARK_FROM || h < FALLBACK_DARK_UNTIL;
}

/** The next time it turns dark or light (to within 5 minutes), looking up to a day ahead. */
export function nextLightChange(date: Date, where: LngLat | null): Date {
  const now = isDark(date, where);
  const step = 5 * 60000;
  for (let t = date.getTime() + step; t <= date.getTime() + 26 * 3600000; t += step) {
    if (isDark(new Date(t), where) !== now) return new Date(t);
  }
  // Polar day or night: nothing changes today, so check again in 12 hours.
  return new Date(date.getTime() + 12 * 3600000);
}
