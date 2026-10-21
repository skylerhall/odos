import { describe, expect, it } from 'vitest';
import { FUEL } from '../src/config';
import { burn, fullTank, gasStopWindow, outlook, speedFactor } from '../src/core/fuel';
import { buildLine, destinationPoint, haversine, MI, pointAt, sliceLine, snapToLine, type LngLat } from '../src/core/geo';
import { LaneAdvisor, scoreLanes } from '../src/core/lanes';
import { simulateLanes } from '../src/core/laneSim';
import { NavTracker } from '../src/core/nav';
import { insertStop, pickGasStop, withinRestLimit, type Place, type RestOption } from '../src/core/places';
import { congestionRuns, parseRoute, type ApiRoute } from '../src/core/route';
import { formatCoords, mapsLink } from '../src/core/share';
import { closestRegistryMatch, searchVehicles } from '../src/core/vehicles/match';
import { REGISTRY } from '../src/core/vehicles/registry';
import type { Vehicle } from '../src/core/vehicles/types';

// A straight 200-mile road heading due east from Denver.
const START: LngLat = [-104.99, 39.74];
const coords: LngLat[] = Array.from({ length: 201 }, (_, i) => destinationPoint(START, i * MI, 90));
const road = buildLine(coords);
const mileAt = (mi: number) => pointAt(road, mi * MI).coord;

const camry: Vehicle = { id: 'c', make: 'Toyota', model: 'Camry', engine: '2.5L', mpg: 30, tankGal: 10, fuel: 'gas', source: 'registry' };

describe('geo', () => {
  it('measures distance and snaps onto a line', () => {
    expect(road.length / MI).toBeCloseTo(200, 0);
    const off = destinationPoint(mileAt(50), 100, 0); // 100 m north of mile 50
    const s = snapToLine(road, off);
    expect(s.along / MI).toBeCloseTo(50, 1);
    expect(s.offset).toBeGreaterThan(90);
    expect(s.offset).toBeLessThan(110);
  });
  it('slices a stretch of route', () => {
    const part = buildLine(sliceLine(road, 10 * MI, 25 * MI));
    expect(part.length / MI).toBeCloseTo(15, 1);
    expect(haversine(part.coords[0], mileAt(10))).toBeLessThan(1);
  });
});

describe('fuel', () => {
  it('burns at EPA mpg below 55 mph and worse above', () => {
    const f = burn(fullTank(camry), camry, 30 * MI, 50);
    expect(f.gallons).toBeCloseTo(9, 5);
    expect(speedFactor(75)).toBeCloseTo(0.76, 2);
    expect(burn(fullTank(camry), camry, 30 * MI, 75).gallons).toBeLessThan(9);
  });
  it('fires the 50-mile buffer and reports miles until the alert', () => {
    const full = outlook(fullTank(camry), camry);
    expect(full.rangeMi).toBe(300);
    expect(full.untilAlertMi).toBe(300 - FUEL.bufferMiles);
    expect(full.inBuffer).toBe(false);
    const low = outlook({ gallons: 1.6, milesSinceFill: 252 }, camry);
    expect(low.inBuffer).toBe(true);
  });
  it('keeps the gas stop window 15–30 miles ahead, inside reachable range', () => {
    expect(gasStopWindow(100, 50)).toEqual({ fromMi: 115, toMi: 130 });
    expect(gasStopWindow(100, 25)).toEqual({ fromMi: 115, toMi: 120 });
  });
});

describe('gas stop picking', () => {
  const station = (id: string, mi: number, offNorthM: number): Place => ({
    id,
    name: id,
    kind: 'gas',
    coord: destinationPoint(mileAt(mi), offNorthM, 0),
  });
  const win = gasStopWindow(100, 50);

  it('prefers an on-route station inside the window', () => {
    const pick = pickGasStop([station('early', 108, 50), station('good', 122, 200), station('late', 140, 10)], road, 100 * MI, win, 50);
    expect(pick?.place.id).toBe('good');
    expect(pick?.inWindow).toBe(true);
    expect(pick?.aheadMi).toBeCloseTo(22, 0);
  });
  it('falls back to the best reachable station when the window is empty', () => {
    const pick = pickGasStop([station('early', 108, 50), station('toofar', 160, 10)], road, 100 * MI, win, 50);
    expect(pick?.place.id).toBe('early');
    expect(pick?.inWindow).toBe(false);
  });
  it('ignores stations behind us or out of range', () => {
    expect(pickGasStop([station('behind', 90, 10), station('far', 170, 10)], road, 100 * MI, win, 50)).toBeNull();
  });
  it('orders inserted stops along the route', () => {
    const a = { ...station('a', 150, 0), kind: 'hotel' as const };
    const b = station('b', 120, 0);
    expect(insertStop([a], b, road, 100 * MI).map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('rest finder limit', () => {
  it('drops anything over a 2-hour drive and sorts nearest first', () => {
    const opt = (id: string, h: number): RestOption => ({ id, name: id, kind: 'hotel', coord: START, driveSeconds: h * 3600, miles: h * 50, estimated: false });
    expect(withinRestLimit([opt('a', 1.5), opt('b', 2.5), opt('c', 0.2)]).map((o) => o.id)).toEqual(['c', 'a']);
  });
});

describe('lanes (70% live / 30% human-flow)', () => {
  it('picks the fastest lane on live speed when history agrees', () => {
    const s = scoreLanes([{ live: 70, human: 68 }, { live: 64, human: 62 }, { live: 58, human: 55 }]);
    expect(s.best).toBe(0);
    expect(s.flip).toBe(false);
  });
  it('flips when the human-flow pattern outweighs a small live edge', () => {
    // Live says left is 2 mph faster; history says the right lane is 12 mph faster here.
    const s = scoreLanes([{ live: 62, human: 55 }, { live: 60, human: 67 }]);
    expect(s.liveBest).toBe(0);
    expect(s.best).toBe(1);
    expect(s.flip).toBe(true);
  });
  it('never recommends a lane that cannot make the next turn', () => {
    const s = scoreLanes([{ live: 80 }, { live: 50 }], [false, true]);
    expect(s.best).toBe(1);
  });
  it('waits for the hold time and minimum gain before suggesting a change', () => {
    const adv = new LaneAdvisor();
    const obs = [{ live: 70 }, { live: 60 }];
    expect(adv.update(obs, { currentLane: 1, now: 0 }).changeTo).toBeNull();
    expect(adv.update(obs, { currentLane: 1, now: 9000 }).changeTo).toBe(0);
    expect(adv.update([{ live: 61 }, { live: 60 }], { currentLane: 1, now: 20000 }).changeTo).toBeNull();
  });
  it('the simulator produces a human-flow flip on its contrarian stretch', () => {
    const s = scoreLanes(simulateLanes(3, 65, 50)); // 45–90 s is the contrarian stretch
    expect(s.flip).toBe(true);
    expect(s.best).toBe(2);
  });
});

describe('vehicle search', () => {
  it('finds every Dodge, and narrows by model and engine', () => {
    const dodge = searchVehicles('dodge');
    expect(dodge.length).toBeGreaterThanOrEqual(17);
    expect(dodge.every((v) => v.make === 'Dodge')).toBe(true);
    expect(searchVehicles('dodge charger 5.7')[0].engine).toContain('R/T');
  });
  it('handles nicknames and punctuation', () => {
    expect(searchVehicles('chevy silverado')[0].make).toBe('Chevrolet');
    expect(searchVehicles('f150 powerboost')[0].engine).toContain('PowerBoost');
  });
  it('has a large registry with sane numbers', () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(200);
    expect(new Set(REGISTRY.map((v) => v.id)).size).toBe(REGISTRY.length);
    for (const v of REGISTRY) {
      expect(v.mpg).toBeGreaterThan(5);
      expect(v.tankGal).toBeGreaterThan(0.5);
    }
  });
  it('matches outside data back to a registry entry for tank size', () => {
    expect(closestRegistryMatch('DODGE', 'Charger', 5.7)?.engine).toContain('5.7');
  });
});

describe('route parsing + navigation', () => {
  // Two steps: 100 mi east, then a right turn and 100 mi more (still east, for simplicity).
  const api: ApiRoute = {
    distance: road.length,
    duration: (200 / 60) * 3600,
    geometry: { coordinates: coords },
    legs: [
      {
        distance: road.length,
        annotation: { congestion: coords.slice(1).map((_, i) => (i < 100 ? 'low' : 'heavy')) },
        steps: [
          {
            distance: 100 * MI,
            duration: 6000,
            name: 'I-70 E',
            maneuver: { type: 'depart', instruction: 'Head east on I-70', location: coords[0] },
            voiceInstructions: [
              { distanceAlongGeometry: 100 * MI, announcement: 'Head east on I-70' },
              { distanceAlongGeometry: 1 * MI, announcement: 'In 1 mile, take exit 100' },
            ],
            intersections: [{ location: coords[0] }],
          },
          {
            distance: 100 * MI,
            duration: 6000,
            name: 'US-24',
            maneuver: { type: 'off ramp', modifier: 'right', instruction: 'Take exit 100', location: coords[100] },
            intersections: [{ location: coords[100], lanes: [{ valid: false, indications: ['straight'] }, { valid: true, indications: ['right'] }] }],
          },
          { distance: 0, duration: 0, name: '', maneuver: { type: 'arrive', instruction: 'Arrive', location: coords[200] } },
        ],
      },
    ],
  };
  const route = parseRoute(api);

  it('parses steps, voice timing, lanes and congestion', () => {
    expect(route.steps).toHaveLength(3);
    expect(route.steps[0].voice[1].at / MI).toBeCloseTo(99, 1);
    expect(route.lanes[0].at / MI).toBeCloseTo(100, 1);
    expect(route.cruiseMph).toBeCloseTo(60, 0);
    const runs = congestionRuns(route);
    expect(runs.map((r) => r.level)).toEqual(['low', 'heavy']);
  });

  it('flags routes that use toll roads', () => {
    expect(route.tolls).toBe(false);
    const withToll: ApiRoute = {
      ...api,
      legs: api.legs.map((leg) => ({
        ...leg,
        steps: leg.steps.map((st, i) => (i === 1 ? { ...st, intersections: [{ location: coords[100], classes: ['toll', 'motorway'] }] } : st)),
      })),
    };
    expect(parseRoute(withToll).tolls).toBe(true);
  });

  it('tracks progress, speaks prompts once, shows lanes ahead, detects off-route', () => {
    const nav = new NavTracker(route);
    expect(nav.update(mileAt(0)).speak).toEqual(['Head east on I-70']);
    nav.update(mileAt(50));
    const near = nav.update(mileAt(99.2));
    expect(near.speak).toEqual(['In 1 mile, take exit 100']);
    expect(near.progress.toManeuver / MI).toBeCloseTo(0.8, 1);
    expect(near.progress.next?.name).toBe('US-24');
    expect(near.progress.lanesAhead?.lanes[1].valid).toBe(true);
    expect(nav.update(mileAt(99.3)).speak).toEqual([]);
    const away = destinationPoint(mileAt(120), 2000, 0);
    nav.update(away);
    nav.update(away);
    expect(nav.update(away).progress.offRoute).toBe(true);
    expect(nav.update(mileAt(199.99)).progress.arrived).toBe(true);
  });
});

describe('share', () => {
  it('formats coordinates lat, lon and builds a universal link', () => {
    expect(formatCoords([-104.990251, 39.739236])).toBe('39.739236, -104.990251');
    expect(mapsLink([-104.99, 39.74])).toBe('https://maps.google.com/?q=39.740000,-104.990000');
  });
});
