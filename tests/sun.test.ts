import { describe, expect, it } from 'vitest';
import type { LngLat } from '../src/core/geo';
import { isDark, nextLightChange, sunElevation } from '../src/core/sun';

const DENVER: LngLat = [-104.99, 39.74];
const MIAMI: LngLat = [-80.19, 25.76];

describe('sun position', () => {
  it('puts the sun high at midday and below the horizon at night', () => {
    // June 21, 2026, solar noon in Denver is about 13:00 MDT = 19:00 UTC: elevation ≈ 73.7°.
    expect(sunElevation(new Date('2026-06-21T19:00:00Z'), DENVER[1], DENVER[0])).toBeGreaterThan(72);
    expect(sunElevation(new Date('2026-06-21T19:00:00Z'), DENVER[1], DENVER[0])).toBeLessThan(75);
    expect(isDark(new Date('2026-06-21T19:00:00Z'), DENVER)).toBe(false);
    // 11 pm MDT.
    expect(isDark(new Date('2026-06-22T05:00:00Z'), DENVER)).toBe(true);
  });

  it('switches around the real sunset, which moves with the seasons', () => {
    // Denver sunsets: about 8:32 pm MDT on June 21 (02:32 UTC), about 4:39 pm MST on Dec 21 (23:39 UTC).
    const juneSunset = nextLightChange(new Date('2026-06-22T01:00:00Z'), DENVER);
    expect(Math.abs(juneSunset.getTime() - Date.parse('2026-06-22T02:32:00Z'))).toBeLessThan(10 * 60000);
    const decSunset = nextLightChange(new Date('2026-12-21T22:00:00Z'), DENVER);
    expect(Math.abs(decSunset.getTime() - Date.parse('2026-12-21T23:39:00Z'))).toBeLessThan(10 * 60000);
  });

  it('follows the location, not the phone time zone', () => {
    // Same instant: just after sunset in Miami (Eastern), still daylight in Denver (Mountain).
    const t = new Date('2026-06-22T00:45:00Z');
    expect(isDark(t, MIAMI)).toBe(true);
    expect(isDark(t, DENVER)).toBe(false);
  });

  it('falls back to 7 pm to 7 am on the phone clock without a fix', () => {
    const at = (h: number) => {
      const d = new Date(2026, 5, 21, h, 30);
      return isDark(d, null);
    };
    expect([6, 7, 12, 18, 19, 23].map(at)).toEqual([true, false, false, false, true, true]);
  });
});
