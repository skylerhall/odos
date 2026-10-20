import { MAKE_ALIASES, REGISTRY } from './registry';
import type { Vehicle } from './types';

// Strip punctuation and spaces so "f150", "F-150" and "f 150" all compare equal.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type Indexed = { v: Vehicle; make: string; model: string; engine: string; all: string; years: [number, number] | null };

const INDEX: Indexed[] = REGISTRY.map((v) => {
  const m = v.years?.match(/^(\d{4})-(\d{4})$/);
  return {
    v,
    make: norm(v.make),
    model: norm(v.model),
    engine: norm(v.engine),
    all: norm(`${v.make} ${v.model} ${v.engine} ${v.fuel === 'ev' ? 'electric ev' : v.fuel}`),
    years: m ? [Number(m[1]), Number(m[2])] : null,
  };
});

/** Entries without a year range are current-generation models, roughly this model year on. */
const CURRENT_GEN_FROM = 2016;

const YEAR = /^(19[89]\d|20[0-4]\d)$/;

export type VehicleQuery = {
  /** Model year typed, e.g. 2007. */
  year?: number;
  /** The other words, lowercased, with nicknames expanded ("chevy" → "chevrolet"). */
  words: string[];
  /** Engine size typed, e.g. "4.7". */
  displacement?: string;
};

/** Split what the driver typed into year, engine size and the remaining words. */
export function parseVehicleQuery(query: string): VehicleQuery {
  const out: VehicleQuery = { words: [] };
  for (const raw of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (YEAR.test(raw) && out.year == null) {
      out.year = Number(raw);
      continue;
    }
    const disp = raw.match(/^(\d\.\d)l?$/);
    if (disp) out.displacement = disp[1];
    out.words.push((MAKE_ALIASES[norm(raw)] ?? raw).toLowerCase());
  }
  return out;
}

/**
 * Search the built-in registry. Every word typed must match somewhere in make, model or engine;
 * results are ranked so an exact make or model match beats a partial one. A model year narrows the
 * list to the generation that covers it.
 */
export function searchVehicles(query: string, list: Indexed[] = INDEX): Vehicle[] {
  const q = parseVehicleQuery(query);
  const ts = q.words.map(norm).filter(Boolean);
  if (ts.length === 0) return [];
  const scored: { v: Vehicle; score: number }[] = [];
  for (const item of list) {
    let score = 0;
    let ok = true;
    if (q.year != null) {
      if (item.years) {
        if (q.year < item.years[0] || q.year > item.years[1]) continue;
        score += 8;
      } else if (q.year < CURRENT_GEN_FROM) continue;
    }
    for (const t of ts) {
      if (item.make === t) score += 6;
      else if (item.make.startsWith(t)) score += 4;
      else if (item.model === t) score += 6;
      else if (item.model.startsWith(t)) score += 4;
      else if (item.engine.includes(t)) score += 3;
      else if (item.all.includes(t)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ v: item.v, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.v.make.localeCompare(b.v.make) || a.v.model.localeCompare(b.v.model)).map((s) => s.v);
}

/**
 * Best registry entry for a vehicle described by an outside source (VIN decode or EPA). Used to
 * borrow a tank size, since EPA data does not include one.
 */
export function closestRegistryMatch(make: string, model: string, displacementL?: number, year?: number): Vehicle | undefined {
  // EPA model names carry drivetrain suffixes ("Tundra 4WD"); compare on the base name.
  const baseModel = model.replace(/\s+(2WD|4WD|AWD|FWD|RWD|FFV|Pickup.*|Cab.*)$/i, '');
  const mk = norm(MAKE_ALIASES[norm(make)] ?? make);
  const md = norm(baseModel);
  const sameMake = INDEX.filter((i) => i.make === mk);
  if (sameMake.length === 0) return undefined;
  const sameModel = sameMake.filter((i) => i.model === md || md.startsWith(i.model) || i.model.startsWith(md));
  const modelPool = sameModel.length ? sameModel : sameMake;
  // Prefer the generation that covers the model year, so the tank size matches that body style.
  const sameGen =
    year == null ? [] : modelPool.filter((i) => (i.years ? year >= i.years[0] && year <= i.years[1] : year >= CURRENT_GEN_FROM));
  const pool = sameGen.length ? sameGen : modelPool;
  if (displacementL == null) return pool[0].v;
  let best = pool[0];
  let bestDiff = Infinity;
  for (const i of pool) {
    const m = i.v.engine.match(/(\d+\.\d)L/);
    const diff = m ? Math.abs(parseFloat(m[1]) - displacementL) : 99;
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return best.v;
}

export const ALL_MAKES = [...new Set(REGISTRY.map((v) => v.make))].sort();
