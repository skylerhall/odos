import { FUEL } from '../config';
import { MI } from './geo';
import type { Vehicle } from './vehicles/types';

export type FuelState = {
  /** Fuel (or gallon-equivalents of charge) left in the tank. */
  gallons: number;
  /** Miles driven since the driver last tapped "I just filled up". */
  milesSinceFill: number;
  lastFillAt?: number;
};

/**
 * Efficiency multiplier for speed. EPA combined figures roughly hold up to ~55 mph; above that,
 * aerodynamic drag costs about 1.2% per mph. Floors at 60% so extreme speeds stay sane.
 */
export function speedFactor(mph: number): number {
  if (!Number.isFinite(mph) || mph <= 55) return 1;
  return Math.max(0.6, 1 - 0.012 * (mph - 55));
}

export function fullTank(vehicle: Vehicle): FuelState {
  return { gallons: vehicle.tankGal, milesSinceFill: 0, lastFillAt: Date.now() };
}

/** Burn fuel for a distance driven at a given speed. */
export function burn(state: FuelState, vehicle: Vehicle, meters: number, mph: number): FuelState {
  if (meters <= 0) return state;
  const miles = meters / MI;
  const used = miles / (vehicle.mpg * speedFactor(mph));
  return { ...state, gallons: Math.max(0, state.gallons - used), milesSinceFill: state.milesSinceFill + miles };
}

/**
 * Miles left in the tank. Pass the expected cruising speed (e.g. the route's average) for a
 * Tesla-style "range at the pace you'll actually drive" estimate instead of the EPA sticker.
 */
export function rangeMiles(state: FuelState, vehicle: Vehicle, cruiseMph?: number): number {
  return state.gallons * vehicle.mpg * speedFactor(cruiseMph ?? 0);
}

export type FuelOutlook = {
  rangeMi: number;
  /** Miles until the 50-mile buffer alert fires (0 once it has). */
  untilAlertMi: number;
  inBuffer: boolean;
  /** Range left on arrival at the destination, if there is a route. Negative means a stop is needed. */
  arrivalMi: number | null;
  percent: number;
};

export function outlook(
  state: FuelState,
  vehicle: Vehicle,
  opts: { remainingMiles?: number; cruiseMph?: number } = {},
): FuelOutlook {
  const rangeMi = rangeMiles(state, vehicle, opts.cruiseMph);
  return {
    rangeMi,
    untilAlertMi: Math.max(0, rangeMi - FUEL.bufferMiles),
    inBuffer: rangeMi <= FUEL.bufferMiles,
    arrivalMi: opts.remainingMiles == null ? null : rangeMi - opts.remainingMiles,
    percent: vehicle.tankGal > 0 ? Math.min(1, state.gallons / vehicle.tankGal) : 0,
  };
}

/**
 * Where along the route (in miles from the start) an auto gas stop may go: 15–30 miles past the
 * current position, but never beyond what the tank can reach with a 5-mile cushion.
 */
export function gasStopWindow(currentAlongMi: number, rangeMi: number): { fromMi: number; toMi: number } {
  const reach = currentAlongMi + Math.max(0, rangeMi - 5);
  return {
    fromMi: Math.min(currentAlongMi + FUEL.stopMinMiles, reach),
    toMi: Math.min(currentAlongMi + FUEL.stopMaxMiles, reach),
  };
}
