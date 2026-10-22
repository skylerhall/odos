// What the map's position marker should look like for a vehicle: a top-down car, pickup or van.
// The vehicle data has no body type, so it's read from the model name.

import type { Vehicle } from './types';

export type BodyStyle = 'car' | 'truck' | 'van';

const TRUCKS =
  /\b(f-?\s?(150|250|350|450)|super duty|lightning|silverado|sierra|ram\s?(1500|2500|3500)|^ram$|tundra|tacoma|colorado|canyon|ranger|frontier|titan|gladiator|ridgeline|maverick|santa cruz|cybertruck|r1t|hummer ev pickup|avalanche|dakota|hilux|pickup)\b/i;
const VANS =
  /\b(sienna|odyssey|pacifica|voyager|carnival|sedona|grand caravan|caravan|quest|transit|sprinter|promaster|express|savana|metris|nv200|nv\s?(1500|2500|3500)|id\.?\s?buzz|e-transit|esprinter|minivan|van)\b/i;

export function bodyStyle(v: Pick<Vehicle, 'make' | 'model'> | null): BodyStyle {
  if (!v) return 'car';
  const name = `${v.model}`.trim();
  if (TRUCKS.test(name) || (v.make.toLowerCase() === 'ram' && /\b\d{4}\b/.test(name))) return 'truck';
  if (VANS.test(name)) return 'van';
  return 'car';
}
