// Reads "Where to?" text for "find me something nearby" intent: "nearest gas station", "coffee near me",
// "closest hotel", or just "gas". Anything else (an address, "Shell on Main St") is a normal search.

import type { PlaceKind } from './places';

export type NearbyCategory = {
  /** Mapbox Search Box category ids, tried together. */
  categories: string[];
  /** Plural, for the results heading: "Nearest gas stations". */
  label: string;
  /** What kind of stop it becomes if added to a trip. */
  kind: PlaceKind;
};

export type ParsedSearch = {
  /** Set when the text, minus "nearest"-style words, names a kind of place. */
  nearby: NearbyCategory | null;
  /** The text with the "nearest"-style words removed, for a normal search. */
  text: string;
  /** The driver asked for the nearest/closest one, so sort by drive time. */
  nearest: boolean;
};

const CATEGORY_WORDS: [string[], NearbyCategory][] = [
  [
    ['gas', 'gas station', 'gas stations', 'fuel', 'fuel station', 'petrol', 'diesel', 'filling station', 'gas pump', 'gas pumps'],
    { categories: ['gas_station'], label: 'gas stations', kind: 'gas' },
  ],
  [
    ['ev charger', 'ev chargers', 'charger', 'chargers', 'charging station', 'charging stations', 'ev charging', 'supercharger', 'superchargers'],
    { categories: ['ev_charging_station'], label: 'EV chargers', kind: 'gas' },
  ],
  [
    ['truck stop', 'truck stops', 'travel center', 'travel centers', 'travel plaza'],
    { categories: ['truck_stop', 'gas_station'], label: 'truck stops', kind: 'gas' },
  ],
  [
    ['food', 'restaurant', 'restaurants', 'place to eat', 'places to eat', 'somewhere to eat', 'something to eat', 'eat'],
    { categories: ['restaurant', 'fast_food'], label: 'places to eat', kind: 'destination' },
  ],
  [['fast food', 'drive thru', 'drive through'], { categories: ['fast_food'], label: 'fast food', kind: 'destination' }],
  [['coffee', 'coffee shop', 'coffee shops', 'cafe', 'cafes'], { categories: ['coffee', 'cafe'], label: 'coffee shops', kind: 'destination' }],
  [
    ['hotel', 'hotels', 'motel', 'motels', 'lodging', 'place to stay', 'somewhere to stay'],
    { categories: ['hotel', 'motel'], label: 'hotels', kind: 'hotel' },
  ],
  [
    ['campground', 'campgrounds', 'campsite', 'campsites', 'camping', 'rv park', 'rv parks'],
    { categories: ['campground', 'rv_park'], label: 'campgrounds', kind: 'camp' },
  ],
  [['rest area', 'rest areas', 'rest stop', 'rest stops'], { categories: ['rest_area'], label: 'rest areas', kind: 'destination' }],
  [['parking', 'parking lot', 'parking lots', 'parking garage'], { categories: ['parking_lot', 'parking'], label: 'parking', kind: 'destination' }],
  [
    ['grocery', 'groceries', 'grocery store', 'grocery stores', 'supermarket', 'supermarkets'],
    { categories: ['grocery', 'supermarket'], label: 'grocery stores', kind: 'destination' },
  ],
  [['pharmacy', 'pharmacies', 'drug store', 'drugstore'], { categories: ['pharmacy'], label: 'pharmacies', kind: 'destination' }],
  [['hospital', 'hospitals', 'emergency room'], { categories: ['hospital'], label: 'hospitals', kind: 'destination' }],
  [['atm', 'atms', 'cash machine'], { categories: ['atm'], label: 'ATMs', kind: 'destination' }],
];

const LOOKUP = new Map(CATEGORY_WORDS.flatMap(([words, cat]) => words.map((w) => [w, cat] as const)));

// Longest phrases first, so "near me" goes before "near".
const NEAREST = ['nearest', 'closest', 'nearby', 'near me', 'near here', 'around me', 'around here', 'close by', 'close to me', 'in the area', 'in this area'];
const FILLER = ['find', 'show me', 'show', 'where is', "where's", 'where are', 'any', 'some', 'a', 'an', 'the', 'please', 'local', 'near', 'me'];

const phrase = (words: string[]) =>
  new RegExp(`\\b(${[...words].sort((x, y) => y.length - x.length).map((w) => w.replace(/'/g, "'?")).join('|')})\\b`, 'g');
const NEAREST_RE = phrase(NEAREST);
const FILLER_RE = phrase(FILLER);

export function parseSearch(query: string): ParsedSearch {
  const norm = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nearest = new RegExp(NEAREST_RE.source).test(norm);
  const text = norm.replace(NEAREST_RE, ' ').replace(/\s+/g, ' ').trim();
  const core = text.replace(FILLER_RE, ' ').replace(/\s+/g, ' ').trim();
  const nearby = LOOKUP.get(core) ?? (core.endsWith('s') ? LOOKUP.get(core.slice(0, -1)) : undefined) ?? null;
  return { nearby, text: text || norm, nearest };
}
