// Exact vehicle lookup when online: fueleconomy.gov (official EPA data for every US car since 1984)
// for year → make → model → engine, plus NHTSA vPIC for decoding a VIN.

import { closestRegistryMatch } from '../core/vehicles/match';
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
  const fuel: FuelKind =
    atv === 'ev' ? 'ev' : atv.includes('hybrid') ? 'hybrid' : /diesel/i.test(e.fuelType1 ?? '') ? 'diesel' : 'gas';
  const match = closestRegistryMatch(e.make, e.model, displ);
  // EPA has no tank size. EVs: derive from rated range. Others: borrow from the closest built-in match.
  const tankGal = fuel === 'ev' && Number(e.range) > 0 ? +(Number(e.range) / mpg).toFixed(2) : match?.tankGal ?? 16;
  const engine =
    fuel === 'ev'
      ? `Electric${e.range ? ` · ${e.range} mi range` : ''}`
      : [displ ? `${displ.toFixed(1)}L` : null, e.cylinders ? `${e.cylinders}-cyl` : null, fuel === 'hybrid' ? 'Hybrid' : null, fuel === 'diesel' ? 'Diesel' : null]
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
