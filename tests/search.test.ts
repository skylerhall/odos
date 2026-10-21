import { describe, expect, it } from 'vitest';
import { parseSearch } from '../src/core/search';

describe('parseSearch', () => {
  it.each([
    'nearest gas station',
    'Nearest gas station?',
    'closest gas',
    'gas near me',
    'gas stations nearby',
    'find the nearest gas station',
    'gas',
    'where is the closest gas station',
  ])('reads "%s" as a nearby gas search', (q) => {
    const p = parseSearch(q);
    expect(p.nearby?.categories).toEqual(['gas_station']);
    expect(p.nearby?.kind).toBe('gas');
  });

  it('knows other kinds of places', () => {
    expect(parseSearch('coffee near me').nearby?.label).toBe('coffee shops');
    expect(parseSearch('closest hotels').nearby?.kind).toBe('hotel');
    expect(parseSearch('nearest ev charger').nearby?.categories).toEqual(['ev_charging_station']);
    expect(parseSearch('rest stops nearby').nearby?.label).toBe('rest areas');
    expect(parseSearch('nearest pharmacy').nearby?.label).toBe('pharmacies');
  });

  it('leaves names and addresses as normal searches', () => {
    expect(parseSearch('Shell on Main St').nearby).toBeNull();
    expect(parseSearch('1600 Pennsylvania Ave').nearby).toBeNull();
    expect(parseSearch('Denver').nearby).toBeNull();
    expect(parseSearch('Gas Works Park').nearby).toBeNull();
  });

  it('keeps the "nearest" wish for named places', () => {
    const p = parseSearch('nearest Walmart');
    expect(p.nearby).toBeNull();
    expect(p.nearest).toBe(true);
    expect(p.text).toBe('walmart');
    expect(parseSearch('Walmart').nearest).toBe(false);
  });
});
