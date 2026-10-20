import { afterEach, describe, expect, it, vi } from 'vitest';
import { closestRegistryMatch, parseVehicleQuery, searchVehicles } from '../src/core/vehicles/match';
import { epaSearch } from '../src/services/vehicleLookup';

describe('vehicle search with model years', () => {
  it('finds a 2007 Tundra 4.7', () => {
    const r = searchVehicles('2007 toyota tundra 4.7');
    expect(r[0]).toMatchObject({ make: 'Toyota', model: 'Tundra', years: '2000-2009' });
    expect(r[0].engine).toContain('4.7');
  });
  it('a year keeps only the generations that cover it', () => {
    const old = searchVehicles('2007 tundra');
    expect(old.length).toBeGreaterThan(0);
    expect(old.every((v) => v.years && Number(v.years.slice(0, 4)) <= 2007 && Number(v.years.slice(5)) >= 2007)).toBe(true);
    const recent = searchVehicles('2023 tundra');
    expect(recent.some((v) => v.engine.includes('3.4L'))).toBe(true);
    expect(recent.some((v) => v.engine.includes('4.7'))).toBe(false);
  });
  it('without a year, old and new generations both show', () => {
    const all = searchVehicles('tundra');
    expect(all.some((v) => v.years === '2000-2009')).toBe(true);
    expect(all.some((v) => v.years == null)).toBe(true);
  });
  it('parses year, engine size and nicknames', () => {
    expect(parseVehicleQuery('2007 Chevy Silverado 5.3L')).toEqual({ year: 2007, words: ['chevrolet', 'silverado', '5.3l'], displacement: '5.3' });
  });
  it('borrows the tank size from the right generation', () => {
    expect(closestRegistryMatch('TOYOTA', 'Tundra 4WD', 4.7, 2007)?.years).toBe('2000-2009');
  });
});

describe('EPA exact search', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('walks make → model → engine and keeps the typed engine size', async () => {
    const menus: Record<string, unknown> = {
      make: { menuItem: [{ text: 'Ford', value: 'Ford' }, { text: 'Toyota', value: 'Toyota' }] },
      model: { menuItem: [{ text: 'Camry', value: 'Camry' }, { text: 'Tundra 2WD', value: 'Tundra 2WD' }, { text: 'Tundra 4WD', value: 'Tundra 4WD' }] },
      options: {
        menuItem: [
          { text: 'Auto 5-spd, 8 cyl, 4.7 L', value: '23001' },
          { text: 'Auto 6-spd, 8 cyl, 5.7 L', value: '23002' },
        ],
      },
    };
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        seen.push(url);
        const kind = url.match(/menu\/(\w+)\?/)![1];
        return { ok: true, json: async () => menus[kind] } as Response;
      }),
    );
    const r = await epaSearch(parseVehicleQuery('2007 toyota tundra 4.7'));
    expect(r.map((m) => m.title)).toEqual(['2007 Toyota Tundra 2WD', '2007 Toyota Tundra 4WD']);
    expect(r.every((m) => m.detail.includes('4.7 L'))).toBe(true);
    expect(r[0].id).toBe('23001');
    expect(seen.some((u) => u.includes('year=2007') && u.includes('make=Toyota'))).toBe(true);
  });

  it('needs a year', async () => {
    expect(await epaSearch(parseVehicleQuery('toyota tundra'))).toEqual([]);
  });
});
