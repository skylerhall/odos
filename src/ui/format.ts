import type { IconName } from './controls';
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

/** Icon for a maneuver (type + modifier from Mapbox). */
export function maneuverGlyph(type: string, modifier?: string): IconName {
  if (type === 'arrive') return 'flag-checkered';
  if (type === 'roundabout' || type === 'rotary') return 'rotate-right';
  if (type === 'depart') return 'arrow-up';
  switch (modifier) {
    case 'uturn':
      return 'arrow-u-left-top';
    case 'sharp left':
    case 'left':
      return 'arrow-left';
    case 'slight left':
      return 'arrow-top-left';
    case 'sharp right':
    case 'right':
      return 'arrow-right';
    case 'slight right':
      return 'arrow-top-right';
    default:
      return 'arrow-up';
  }
}

/** Icon for a lane's indications (e.g. ["straight","right"]). */
export function laneGlyph(indications: string[]): IconName {
  const has = (s: string) => indications.includes(s);
  if (has('uturn')) return 'arrow-u-left-top';
  if (has('straight') && (has('left') || has('slight left'))) return 'arrow-left-top';
  if (has('straight') && (has('right') || has('slight right'))) return 'arrow-right-top';
  if (has('left') || has('sharp left')) return 'arrow-left';
  if (has('slight left')) return 'arrow-top-left';
  if (has('right') || has('sharp right')) return 'arrow-right';
  if (has('slight right')) return 'arrow-top-right';
  return 'arrow-up';
}
