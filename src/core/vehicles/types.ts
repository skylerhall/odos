export type FuelKind = 'gas' | 'diesel' | 'hybrid' | 'ev';

export type Vehicle = {
  id: string;
  make: string;
  model: string;
  /** Human label for the powertrain, e.g. "5.7L V8 HEMI" or "Long Range AWD (82 kWh)". */
  engine: string;
  /** Model years this entry represents, when known. */
  years?: string;
  /** EPA combined MPG. For EVs this is MPGe. */
  mpg: number;
  /** Usable tank in gallons. For EVs this is battery kWh converted to gallon-equivalents (÷ 33.7). */
  tankGal: number;
  fuel: FuelKind;
  /** Where the figures came from: built-in list, EPA lookup, or typed by the driver. */
  source: 'registry' | 'epa' | 'custom';
};

/** EPA's energy equivalence: 33.7 kWh = 1 gallon of gasoline. */
export const KWH_PER_GALLON = 33.7;

export function vehicleLabel(v: Vehicle): string {
  return `${v.make} ${v.model} · ${v.engine}`;
}
