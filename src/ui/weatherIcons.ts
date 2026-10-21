import type { Sky } from '../core/weather';
import type { IconName } from './controls';

/** Vector weather icons for the UI (spoken alerts keep the emoji from core/weather). */
export function weatherIconName(sky: Sky, isDay: boolean): IconName {
  switch (sky) {
    case 'clear':
      return isDay ? 'weather-sunny' : 'weather-night';
    case 'partly':
      return isDay ? 'weather-partly-cloudy' : 'weather-night-partly-cloudy';
    case 'cloudy':
      return 'weather-cloudy';
    case 'fog':
      return 'weather-fog';
    case 'drizzle':
    case 'rain':
      return 'weather-rainy';
    case 'heavyRain':
      return 'weather-pouring';
    case 'freezing':
      return 'snowflake-alert';
    case 'snow':
      return 'weather-snowy';
    case 'heavySnow':
      return 'weather-snowy-heavy';
    case 'storm':
      return 'weather-lightning-rainy';
  }
}
