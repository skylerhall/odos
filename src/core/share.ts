import type { LngLat } from './geo';

/** "39.739236, -104.990251": the format every maps app and 911 dispatcher accepts. */
export function formatCoords([lon, lat]: LngLat, digits = 6): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

/** A link that opens a pin on any phone (Android, iPhone, or a browser), no app needed. */
export function mapsLink([lon, lat]: LngLat): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export function shareMessage(coord: LngLat, opts: { destinationName?: string; etaMinutes?: number } = {}): string {
  const lines = [`📍 My location: ${formatCoords(coord)}`, mapsLink(coord)];
  if (opts.destinationName && opts.etaMinutes != null) {
    lines.push(`Heading to ${opts.destinationName}, ETA ${Math.round(opts.etaMinutes)} min`);
  }
  lines.push('— sent from ODOS');
  return lines.join('\n');
}
