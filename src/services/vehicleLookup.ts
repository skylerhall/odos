// Exact vehicle lookup when online: fueleconomy.gov (official EPA data for every US car since 1984)
// for year → make → model → engine, plus NHTSA vPIC for decoding a VIN.

import { closestRegistryMatch, type VehicleQuery } from '../core/vehicles/match';
import type { FuelKind, Vehicle } from '../core/vehicles/types';
import { fetchJson, qs } from './http';

const FE = 'https://www.fueleconomy.gov/ws/rest';
const JSON_HEADERS = { headers: { Accept: 'application/json' } };

export type MenuItem = { text: string; value: string };

// The EPA service returns a bare object instead of an array when there's exactly one item.
const asList = (m: { menuItem?: MenuItem | MenuItem[] } | null): MenuItem[] =>
  m?.menuItem == null ? [] : Array.isArray(m.menuItem) ? m.menuItem : [m.menuItem];

const menu = async (path: string, params: Record<string, string> = {}) =>
  asList(await fetchJson<{ menuItem?: MenuItem | MenuItem[] }>(`${FE}/vehicle/menu/${path}?${qs(params)}`, JSON_HEADERS));

export const epaYears = () => menu('year');
export const epaMakes = (year: string) => menu('make', { year });
export const epaModels = (year: string, make: string) => menu('model', { year, make });
/** Engine/transmission options; each value is an EPA vehicle id. */
export const epaOptions = (year: string, make: string, model: string) => menu('options', { year, make, model });

export type EpaMatch = { id: string; title: string; detail: string };

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Exact EPA matches for a typed search like "2007 toyota tundra 4.7": finds the make for that
 * year, the models whose names contain the other words, then each model's engine options,
 * keeping only the typed engine size when one was given.
 */
export async function epaSearch(q: VehicleQuery): Promise<EpaMatch[]> {
  if (q.year == null || q.words.length === 0) return [];
  const year = String(q.year);
  const words = q.words
    .filter((w) => w !== q.displacement && w !== `${q.displacement}l`)
    .map(squash)
    .filter(Boolean);
  const makes = await epaMakes(year);
  const make =
    makes.find((m) => words.includes(squash(m.text))) ??
    makes.find((m) => words.some((w) => w.length >= 3 && squash(m.text).startsWith(w)));
  const rest = make ? words.filter((w) => !squash(make.text).startsWith(w)) : words;
  // No make typed ("2007 tundra")? Try the makes whose models match, among the common ones.
  const candidates = make ? [make] : makes.filter((m) => COMMON_MAKES.has(m.text.toLowerCase()));
  const modelLists = await Promise.all(candidates.map((mk) => epaModels(year, mk.value).catch(() => [] as MenuItem[])));
  const out: EpaMatch[] = [];
  for (const [i, mk] of candidates.entries()) {
    if (out.length >= 12) break;
    const hits = modelLists[i].filter((m) => rest.length === 0 || rest.every((w) => squash(m.text).includes(w))).slice(0, 4);
    for (const model of hits) {
      const options = await epaOptions(year, mk.value, model.value);
      // Keep the typed engine size, e.g. "4.7" matches "Auto 5-spd, 8 cyl, 4.7 L". If nothing
      // matches (unexpected wording), show every engine rather than nothing.
      const sized = q.displacement
        ? options.filter((o) => new RegExp(`\\b${q.displacement!.replace('.', '\\.')}\\s*L\\b`, 'i').test(o.text))
        : options;
      for (const o of sized.length ? sized : options) {
        out.push({ id: o.value, title: `${year} ${mk.text} ${model.text}`, detail: o.text });
      }
    }
  }
  return out.slice(0, 12);
}

const COMMON_MAKES = new Set(['toyota', 'ford', 'chevrolet', 'gmc', 'dodge', 'ram', 'jeep', 'honda', 'nissan', 'subaru', 'hyundai', 'kia']);

type EpaVehicle = {
  id: string;
  year: string;
  make: string;
  model: string;
  comb08: string;
  displ?: string;
  cylinders?: string;
  trany?: string;
  fuelType1?: string;
  atvType?: string;
  range?: string;
};

export async function epaVehicle(id: string): Promise<Vehicle> {
  const e = await fetchJson<EpaVehicle>(`${FE}/vehicle/${id}`, JSON_HEADERS);
  const mpg = Number(e.comb08) || 25;
  const displ = e.displ ? Number(e.displ) : undefined;
  const atv = (e.atvType ?? '').toLowerCase();
  const fuel: FuelKind = atv === 'ev' ? 'ev' : atv.includes('hybrid') ? 'hybrid' : /diesel/i.test(e.fuelType1 ?? '') ? 'diesel' : 'gas';
  const match = closestRegistryMatch(e.make, e.model, displ, Number(e.year) || undefined);
  // EPA has no tank size. EVs: derive from rated range. Others: borrow from the closest built-in match.
  const tankGal = fuel === 'ev' && Number(e.range) > 0 ? +(Number(e.range) / mpg).toFixed(2) : (match?.tankGal ?? 16);
  const engine =
    fuel === 'ev'
      ? `Electric${e.range ? ` · ${e.range} mi range` : ''}`
      : [
          displ ? `${displ.toFixed(1)}L` : null,
          e.cylinders ? `${e.cylinders}-cyl` : null,
          fuel === 'hybrid' ? 'Hybrid' : null,
          fuel === 'diesel' ? 'Diesel' : null,
        ]
          .filter(Boolean)
          .join(' ');
  return {
    id: `epa-${e.id}`,
    make: e.make,
    model: e.model,
    engine: engine || 'Engine',
    years: e.year,
    mpg,
    tankGal,
    fuel,
    source: 'epa',
  };
}

export type VinInfo = { year: string; make: string; model: string; displacementL?: number };

export async function decodeVin(vin: string): Promise<VinInfo | null> {
  const clean = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)) return null;
  type R = { Make: string; Model: string; ModelYear: string; DisplacementL: string };
  const data = await fetchJson<{ Results: R[] }>(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${clean}?format=json`);
  const r = data.Results?.[0];
  if (!r?.Make) return null;
  return {
    year: r.ModelYear,
    make: r.Make,
    model: r.Model,
    displacementL: r.DisplacementL ? Number(r.DisplacementL) : undefined,
  };
}

/** Turn a decoded VIN into the matching EPA vehicle(s) for the driver to confirm. */
export async function vinToOptions(info: VinInfo): Promise<MenuItem[]> {
  const models = await epaModels(info.year, titleCaseMake(info.make));
  const want = info.model.toLowerCase();
  const model = models.find((m) => m.text.toLowerCase() === want) ?? models.find((m) => m.text.toLowerCase().startsWith(want));
  if (!model) return [];
  return epaOptions(info.year, titleCaseMake(info.make), model.value);
}

// vPIC returns "DODGE"; EPA expects "Dodge" (and a few special cases).
function titleCaseMake(make: string): string {
  const special: Record<string, string> = { BMW: 'BMW', GMC: 'GMC', RAM: 'Ram', MINI: 'MINI', 'MERCEDES-BENZ': 'Mercedes-Benz' };
  const up = make.toUpperCase();
  return special[up] ?? make.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
