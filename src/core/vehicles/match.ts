import { MAKE_ALIASES, REGISTRY } from './registry';
import type { Vehicle } from './types';

// Strip punctuation and spaces so "f150", "F-150" and "f 150" all compare equal.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type Indexed = { v: Vehicle; make: string; model: string; engine: string; all: string };

const INDEX: Indexed[] = REGISTRY.map((v) => ({
  v,
  make: norm(v.make),
  model: norm(v.model),
  engine: norm(v.engine),
  all: norm(`${v.make} ${v.model} ${v.engine} ${v.fuel === 'ev' ? 'electric ev' : v.fuel}`),
}));

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => {
      const alias = MAKE_ALIASES[norm(t)];
      return norm(alias ?? t);
    })
    .filter(Boolean);
}

/**
 * Search the built-in registry. Every word typed must match somewhere in make, model or engine;
 * results are ranked so an exact make or model match beats a partial one.
 */
export function searchVehicles(query: string, list: Indexed[] = INDEX): Vehicle[] {
  const ts = tokens(query);
  if (ts.length === 0) return [];
  const scored: { v: Vehicle; score: number }[] = [];
  for (const item of list) {
    let score = 0;
    let ok = true;
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
  return scored
    .sort((a, b) => b.score - a.score || a.v.make.localeCompare(b.v.make) || a.v.model.localeCompare(b.v.model))
    .map((s) => s.v);
}

/**
 * Best registry entry for a vehicle described by an outside source (VIN decode or EPA). Used to
 * borrow a tank size, since EPA data does not include one.
 */
export function closestRegistryMatch(make: string, model: string, displacementL?: number): Vehicle | undefined {
  const mk = norm(MAKE_ALIASES[norm(make)] ?? make);
  const md = norm(model);
  const sameMake = INDEX.filter((i) => i.make === mk);
  if (sameMake.length === 0) return undefined;
  const sameModel = sameMake.filter((i) => i.model === md || md.startsWith(i.model) || i.model.startsWith(md));
  const pool = sameModel.length ? sameModel : sameMake;
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
