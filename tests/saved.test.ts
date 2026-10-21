import { describe, expect, it } from 'vitest';
import type { Place } from '../src/core/places';
import {
  addRecent,
  addShortcut,
  DEFAULT_SHORTCUTS,
  MAX_RECENTS,
  MAX_SHORTCUTS,
  normalizeShortcuts,
  removeRecent,
  removeShortcut,
  setShortcutPlace,
} from '../src/core/saved';

const place = (id: string, name = id, lng = -105): Place => ({ id, name, coord: [lng, 39.7], kind: 'destination' });

describe('recent places', () => {
  it('puts the newest first, drops duplicates and caps the list', () => {
    let list: Place[] = [];
    for (let i = 0; i < MAX_RECENTS + 3; i++) list = addRecent(list, place(`p${i}`, `P${i}`, -105 + i * 0.01));
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0].id).toBe(`p${MAX_RECENTS + 2}`);
    list = addRecent(list, place('p5', 'P5', -105 + 5 * 0.01));
    expect(list[0].id).toBe('p5');
    expect(list.filter((p) => p.id === 'p5')).toHaveLength(1);
  });

  it('treats the same name a few meters apart as one place, and strips search extras', () => {
    const a = { ...place('a', 'Costco'), driveSeconds: 240, meters: 3000 };
    const b = { ...place('b', 'costco'), coord: [-105.0002, 39.7] as [number, number] };
    const list = addRecent(addRecent([], a), b);
    expect(list).toHaveLength(1);
    expect(Object.keys(addRecent([], a)[0])).not.toContain('driveSeconds');
    expect(removeRecent(list, 'b')).toHaveLength(0);
  });
});

describe('shortcuts', () => {
  it('sets and clears Home without removing it', () => {
    let list = setShortcutPlace(DEFAULT_SHORTCUTS, 'home', place('h', '12 Elm St'));
    expect(list[0].place?.name).toBe('12 Elm St');
    list = removeShortcut(list, 'home');
    expect(list[0]).toMatchObject({ key: 'home', place: null });
    expect(list).toHaveLength(2);
  });

  it('adds custom shortcuts with unique keys and removes them entirely', () => {
    const one = addShortcut(DEFAULT_SHORTCUTS, ' Gym ')!;
    const two = addShortcut(one.list, 'gym')!;
    expect(one.key).toBe('custom:gym');
    expect(two.key).toBe('custom:gym-2');
    expect(two.list.at(-1)).toMatchObject({ label: 'gym', icon: 'star', place: null });
    expect(removeShortcut(two.list, 'custom:gym')).toHaveLength(3);
    expect(addShortcut(DEFAULT_SHORTCUTS, '   ')).toBeNull();
    let full = DEFAULT_SHORTCUTS;
    for (let i = 0; i < 10; i++) full = addShortcut(full, `s${i}`)?.list ?? full;
    expect(full).toHaveLength(MAX_SHORTCUTS);
  });

  it('repairs saved lists', () => {
    expect(normalizeShortcuts(null)).toEqual(DEFAULT_SHORTCUTS);
    const saved = [{ key: 'custom:gym', label: 'Gym', icon: 'star' as const, place: null }, { ...DEFAULT_SHORTCUTS[1], place: place('w') }];
    const fixed = normalizeShortcuts(saved);
    expect(fixed.map((s) => s.key)).toEqual(['home', 'work', 'custom:gym']);
    expect(fixed[1].place?.id).toBe('w');
  });
});
