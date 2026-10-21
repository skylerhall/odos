// Saved places for "Where to?": Home/Work/custom shortcuts and recent destinations. Stored on the phone.

import { haversine } from './geo';
import type { Place } from './places';

export type ShortcutIcon = 'home' | 'work' | 'star';
export type Shortcut = { key: string; label: string; icon: ShortcutIcon; place: Place | null };

export const MAX_RECENTS = 8;
export const MAX_SHORTCUTS = 6;
/** Two entries this close with the same name are the same place. */
const SAME_PLACE_M = 75;

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { key: 'home', label: 'Home', icon: 'home', place: null },
  { key: 'work', label: 'Work', icon: 'work', place: null },
];

const BUILT_IN = new Set(DEFAULT_SHORTCUTS.map((s) => s.key));

/** Keep only what a saved place needs (search results carry extras like drive times). */
function slim(p: Place): Place {
  return { id: p.id, name: p.name, coord: p.coord, kind: p.kind, address: p.address, source: p.source };
}

const samePlace = (a: Place, b: Place) =>
  a.id === b.id || (a.name.toLowerCase() === b.name.toLowerCase() && haversine(a.coord, b.coord) < SAME_PLACE_M);

/** Newest first, no duplicates, at most `max`. */
export function addRecent(list: Place[], place: Place, max = MAX_RECENTS): Place[] {
  return [slim(place), ...list.filter((p) => !samePlace(p, place))].slice(0, max);
}

export function removeRecent(list: Place[], id: string): Place[] {
  return list.filter((p) => p.id !== id);
}

export function setShortcutPlace(list: Shortcut[], key: string, place: Place): Shortcut[] {
  return list.map((s) => (s.key === key ? { ...s, place: slim(place) } : s));
}

/** Home and Work are always there (just emptied); custom shortcuts go away entirely. */
export function removeShortcut(list: Shortcut[], key: string): Shortcut[] {
  return BUILT_IN.has(key) ? list.map((s) => (s.key === key ? { ...s, place: null } : s)) : list.filter((s) => s.key !== key);
}

/** Adds an empty custom shortcut ("Gym") and returns the list and its key; null if full or blank. */
export function addShortcut(list: Shortcut[], label: string): { list: Shortcut[]; key: string } | null {
  const name = label.trim().slice(0, 16);
  if (!name || list.length >= MAX_SHORTCUTS) return null;
  const base = `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  let key = base;
  for (let i = 2; list.some((s) => s.key === key); i++) key = `${base}-${i}`;
  return { list: [...list, { key, label: name, icon: 'star', place: null }], key };
}

/** Saved lists from older versions or a bad write: fall back to the defaults, keep Home/Work first. */
export function normalizeShortcuts(saved: Shortcut[] | null | undefined): Shortcut[] {
  const list = Array.isArray(saved) ? saved.filter((s) => s && typeof s.key === 'string' && typeof s.label === 'string') : [];
  const builtIns = DEFAULT_SHORTCUTS.map((d) => list.find((s) => s.key === d.key) ?? d);
  return [...builtIns, ...list.filter((s) => !BUILT_IN.has(s.key))].slice(0, MAX_SHORTCUTS);
}
