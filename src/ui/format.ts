import { MI } from '../core/geo';

/** Distance for spoken-style display: feet when close, tenths under 10 miles, whole miles beyond. */
export function distance(meters: number): string {
  const mi = meters / MI;
  if (mi < 0.19) return `${Math.max(50, Math.round((meters * 3.28084) / 50) * 50)} ft`;
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export const miles = (mi: number) => `${Math.round(mi)} mi`;

export function duration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function clockIn(seconds: number): string {
  const d = new Date(Date.now() + seconds * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Arrow for a maneuver (type + modifier from Mapbox). */
export function maneuverGlyph(type: string, modifier?: string): string {
  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '⬆';
  if (type === 'roundabout' || type === 'rotary') return '⟳';
  switch (modifier) {
    case 'uturn':
      return '↶';
    case 'sharp left':
    case 'left':
      return '⬅';
    case 'slight left':
      return '⬉';
    case 'sharp right':
    case 'right':
      return '➡';
    case 'slight right':
      return '⬈';
    default:
      return '⬆';
  }
}

/** Arrow for a lane's indications (e.g. ["straight","right"]). */
export function laneGlyph(indications: string[]): string {
  const has = (s: string) => indications.includes(s);
  if (has('uturn')) return '↶';
  if (has('straight') && (has('left') || has('slight left'))) return '↰';
  if (has('straight') && (has('right') || has('slight right'))) return '↱';
  if (has('left') || has('sharp left')) return '←';
  if (has('slight left')) return '↖';
  if (has('right') || has('sharp right')) return '→';
  if (has('slight right')) return '↗';
  return '↑';
}
