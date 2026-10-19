import { describe, expect, it } from 'vitest';
import { burn, fullTank, outlook } from '../src/core/fuel';
import { buildLine, destinationPoint, MI, type LngLat } from '../src/core/geo';
import type { Vehicle } from '../src/core/vehicles/types';
import { drivingTip, firstHazard, fromWmo, nearestHour, routeSamples, weatherFuelFactor, weatherIcon } from '../src/core/weather';

describe('weather conditions', () => {
  it('maps WMO codes to driving conditions', () => {
    expect(fromWmo(0).sky).toBe('clear');
    expect(fromWmo(3).sky).toBe('cloudy');
    expect(fromWmo(63).sky).toBe('rain');
    expect(fromWmo(65)).toMatchObject({ sky: 'heavyRain', hazard: true });
    expect(fromWmo(75)).toMatchObject({ sky: 'heavySnow', hazard: true });
    expect(fromWmo(67).sky).toBe('freezing');
    expect(fromWmo(99)).toMatchObject({ sky: 'storm', hazard: true });
    expect(fromWmo(45).sky).toBe('fog');
    expect(fromWmo(1234).sky).toBe('cloudy'); // unknown codes don't crash
  });
  it('picks day/night icons', () => {
    expect(weatherIcon('clear', true)).toBe('☀️');
    expect(weatherIcon('clear', false)).toBe('🌙');
    expect(weatherIcon('rain', true)).toBe('🌧️');
  });
  it('gives a driving tip, flagging ice when rain meets freezing temps', () => {
    expect(drivingTip(fromWmo(0), 70, 5)).toBeNull();
    expect(drivingTip(fromWmo(61), 33, 5)).toMatch(/Ice/);
    expect(drivingTip(fromWmo(61), 55, 5)).toMatch(/Wet/);
    expect(drivingTip(fromWmo(0), 70, 45)).toMatch(/winds/);
  });
});

describe('weather and fuel', () => {
  it('lowers efficiency for snow and cold, much more for EVs in the cold', () => {
    expect(weatherFuelFactor('clear', 70, 'gas')).toBe(1);
    expect(weatherFuelFactor('snow', 40, 'gas')).toBeCloseTo(0.9);
    expect(weatherFuelFactor('clear', 20, 'ev')).toBeCloseTo(0.75);
    expect(weatherFuelFactor('clear', 20, 'gas')).toBeCloseTo(0.95);
  });
  it('applies the factor to range and burn', () => {
    const v: Vehicle = { id: 'x', make: 'X', model: 'Y', engine: '', mpg: 30, tankGal: 10, fuel: 'gas', source: 'custom' };
    expect(outlook(fullTank(v), v, { efficiency: 0.9 }).rangeMi).toBeCloseTo(270);
    expect(burn(fullTank(v), v, 27 * MI, 50, 0.9).gallons).toBeCloseTo(9);
  });
});

describe('forecast along the route', () => {
  const start: LngLat = [-104.99, 39.74];
  const line = buildLine(Array.from({ length: 201 }, (_, i) => destinationPoint(start, i * MI, 90)));

  it('samples every 40 miles ahead with an ETA, plus the destination', () => {
    const s = routeSamples(line, 20 * MI, 60);
    expect(s.map((p) => Math.round(p.aheadMeters / MI))).toEqual([40, 80, 120, 160, 180]);
    expect(s[0].etaSeconds / 60).toBeCloseTo(40, 0);
  });
  it('matches each point to the forecast hour you will be there', () => {
    expect(nearestHour([0, 3600, 7200, 10800], 5000)).toBe(1);
    expect(nearestHour([0, 3600, 7200, 10800], 99999)).toBe(3);
  });
  it('finds the first hazard ahead', () => {
    const r = (mi: number, code: number) => ({ aheadMeters: mi * MI, etaSeconds: mi * 60, cond: fromWmo(code), tempF: 30 });
    expect(firstHazard([r(40, 2), r(80, 73), r(120, 95)])?.cond.sky).toBe('snow');
    expect(firstHazard([r(40, 0), r(80, 61)])).toBeNull();
  });
});
