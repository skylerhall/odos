import { describe, expect, it } from 'vitest';
import { bodyStyle } from '../src/core/vehicles/body';
import { REGISTRY } from '../src/core/vehicles/registry';

const v = (make: string, model: string) => ({ make, model });

describe('bodyStyle', () => {
  it('knows pickups', () => {
    for (const [make, model] of [
      ['Toyota', 'Tundra'],
      ['Ford', 'F-150'],
      ['Ford', 'F-250 Super Duty'],
      ['Chevrolet', 'Silverado 1500'],
      ['Ram', '1500'],
      ['Toyota', 'Tacoma'],
      ['Tesla', 'Cybertruck'],
      ['Honda', 'Ridgeline'],
    ])
      expect(bodyStyle(v(make, model)), model).toBe('truck');
  });

  it('knows vans', () => {
    for (const [make, model] of [
      ['Toyota', 'Sienna'],
      ['Honda', 'Odyssey'],
      ['Ford', 'Transit'],
      ['Mercedes-Benz', 'Sprinter'],
      ['Ram', 'ProMaster'],
      ['Kia', 'Carnival'],
    ])
      expect(bodyStyle(v(make, model)), model).toBe('van');
  });

  it('defaults to a car (SUVs included), and with no vehicle', () => {
    expect(bodyStyle(v('Toyota', 'Camry'))).toBe('car');
    expect(bodyStyle(v('Chevrolet', 'Tahoe'))).toBe('car');
    expect(bodyStyle(v('Tesla', 'Model Y'))).toBe('car');
    expect(bodyStyle(null)).toBe('car');
  });

  it('gives every built-in vehicle a body style', () => {
    const counts = { car: 0, truck: 0, van: 0 };
    for (const r of REGISTRY) counts[bodyStyle(r)]++;
    expect(counts.truck).toBeGreaterThan(10);
    expect(counts.van).toBeGreaterThan(3);
  });
});
