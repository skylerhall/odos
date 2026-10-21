// Geometry helpers. Coordinates are GeoJSON order: [longitude, latitude].

export type LngLat = [number, number];
export type BBox = [LngLat, LngLat]; // [southwest, northeast]

const R = 6371008.8; // mean Earth radius, meters
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export const MI = 1609.344;
export const metersToMiles = (m: number) => m / MI;
export const milesToMeters = (mi: number) => mi * MI;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** A polyline with cumulative distance (meters) at each vertex, for fast along-route math. */
export type Line = { coords: LngLat[]; cum: number[]; length: number };

export function buildLine(coords: LngLat[]): Line {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return { coords, cum, length: cum[cum.length - 1] ?? 0 };
}

export type Snap = {
  /** Distance from the start of the line to the snapped point, meters. */
  along: number;
  /** Distance from the input point to the line, meters. */
  offset: number;
  /** Index of the segment start vertex. */
  index: number;
  point: LngLat;
};

/**
 * Project a point onto the nearest segment of a line. Pass `fromIndex`/`window` to search only
 * near a previous snap, which keeps per-GPS-fix cost flat on long routes.
 */
export function snapToLine(line: Line, p: LngLat, fromIndex = 0, window = Infinity): Snap {
  const { coords, cum } = line;
  if (coords.length === 1) return { along: 0, offset: haversine(p, coords[0]), index: 0, point: coords[0] };
  const start = Math.max(0, fromIndex - 5);
  const end = Math.min(coords.length - 1, window === Infinity ? coords.length - 1 : fromIndex + window);
  const kx = Math.cos(toRad(p[1])) * 111320; // meters per degree longitude here
  const ky = 110540; // meters per degree latitude
  let best: Snap = { along: 0, offset: Infinity, index: 0, point: coords[0] };
  for (let i = start; i < end; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = (a[0] - p[0]) * kx,
      ay = (a[1] - p[1]) * ky;
    const bx = (b[0] - p[0]) * kx,
      by = (b[1] - p[1]) * ky;
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const qx = ax + t * dx,
      qy = ay + t * dy;
    const offset = Math.hypot(qx, qy);
    if (offset < best.offset) {
      const point: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      best = { along: cum[i] + t * (cum[i + 1] - cum[i]), offset, index: i, point };
    }
  }
  return best;
}

/** Point and travel bearing at a given distance along the line. */
export function pointAt(line: Line, along: number): { coord: LngLat; bearing: number; index: number } {
  const { coords, cum } = line;
  if (along <= 0) return { coord: coords[0], bearing: bearing(coords[0], coords[1] ?? coords[0]), index: 0 };
  if (along >= line.length) {
    const n = coords.length - 1;
    return { coord: coords[n], bearing: bearing(coords[Math.max(0, n - 1)], coords[n]), index: Math.max(0, n - 1) };
  }
  let lo = 0,
    hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= along) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg === 0 ? 0 : (along - cum[lo]) / seg;
  const a = coords[lo],
    b = coords[hi];
  return { coord: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], bearing: bearing(a, b), index: lo };
}

/** The part of the line between two along-distances. */
export function sliceLine(line: Line, from: number, to: number): LngLat[] {
  const a = pointAt(line, Math.max(0, from));
  const b = pointAt(line, Math.min(line.length, to));
  const middle = line.coords.slice(a.index + 1, b.index + 1);
  return [a.coord, ...middle, b.coord];
}

export function bboxOf(coords: LngLat[], padMeters = 0): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const padLat = padMeters / 110540;
  const padLon = padMeters / (111320 * Math.cos(toRad((minY + maxY) / 2)));
  return [
    [minX - padLon, minY - padLat],
    [maxX + padLon, maxY + padLat],
  ];
}

/** Cut a line into chunks and return a padded bounding box for each (used for offline packs and POI prefetch). */
export function corridorBoxes(line: Line, chunkMeters: number, padMeters: number): BBox[] {
  const boxes: BBox[] = [];
  for (let from = 0; from < line.length; from += chunkMeters) {
    boxes.push(bboxOf(sliceLine(line, from, from + chunkMeters), padMeters));
  }
  return boxes;
}

/** Point a given distance and bearing from a start point. */
export function destinationPoint(p: LngLat, meters: number, bearingDeg: number): LngLat {
  const δ = meters / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(p[1]);
  const λ1 = toRad(p[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}
