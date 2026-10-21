// Weather data: Open-Meteo (free, no key, worldwide) for current conditions and the forecast along
// the route, and the US National Weather Service for official alerts (winter storm, flood, etc.).

import type { LngLat } from '../core/geo';
import { fromWmo, nearestHour, type AheadReport, type Condition, type RouteSample } from '../core/weather';
import { fetchJson, qs } from './http';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export type Current = {
  cond: Condition;
  tempF: number | null;
  windMph: number | null;
  isDay: boolean;
  at: number;
};

type CurrentResponse = {
  current?: { weather_code: number; temperature_2m: number; wind_speed_10m: number; is_day: number };
};

export async function currentWeather([lon, lat]: LngLat): Promise<Current> {
  const data = await fetchJson<CurrentResponse>(
    `${OPEN_METEO}?${qs({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'weather_code,temperature_2m,wind_speed_10m,is_day',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
    })}`,
  );
  const c = data.current;
  if (!c) throw new Error('No current weather');
  return { cond: fromWmo(c.weather_code), tempF: c.temperature_2m, windMph: c.wind_speed_10m, isDay: c.is_day === 1, at: Date.now() };
}

type HourlyResponse = { hourly?: { time: number[]; weather_code: number[]; temperature_2m: number[] } };

/** Forecast at each sample point for the hour you'll be there. One request for all points. */
export async function weatherAlongRoute(samples: RouteSample[]): Promise<AheadReport[]> {
  if (samples.length === 0) return [];
  const data = await fetchJson<HourlyResponse | HourlyResponse[]>(
    `${OPEN_METEO}?${qs({
      latitude: samples.map((s) => s.coord[1].toFixed(3)).join(','),
      longitude: samples.map((s) => s.coord[0].toFixed(3)).join(','),
      hourly: 'weather_code,temperature_2m',
      temperature_unit: 'fahrenheit',
      timeformat: 'unixtime',
      forecast_days: 2,
    })}`,
  );
  // Several locations come back as an array; a single one as an object.
  const list = Array.isArray(data) ? data : [data];
  const now = Date.now() / 1000;
  return samples.flatMap((s, i) => {
    const h = list[i]?.hourly;
    if (!h?.time?.length) return [];
    const k = nearestHour(h.time, now + s.etaSeconds);
    return [{ aheadMeters: s.aheadMeters, etaSeconds: s.etaSeconds, cond: fromWmo(h.weather_code[k]), tempF: h.temperature_2m[k] ?? null }];
  });
}

export type WeatherAlert = { id: string; event: string; headline: string; severity: string };

/** Active NWS alerts for a point. US only; elsewhere this quietly returns nothing. */
export async function nwsAlerts([lon, lat]: LngLat): Promise<WeatherAlert[]> {
  type R = { features?: { id: string; properties: { event: string; headline?: string; severity: string } }[] };
  const data = await fetchJson<R>(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
    headers: { Accept: 'application/geo+json', 'User-Agent': 'ODOS navigation app (github.com/skylerhall/odos)' },
    timeoutMs: 8000,
  });
  return (data.features ?? [])
    .filter((f) => ['Extreme', 'Severe', 'Moderate'].includes(f.properties.severity))
    .map((f) => ({
      id: f.id,
      event: f.properties.event,
      headline: f.properties.headline ?? f.properties.event,
      severity: f.properties.severity,
    }));
}
