import { StyleSheet, Text } from 'react-native';
import type { WeatherState } from '../state/useWeather';
import { Icon, PressScale, useTheme } from './controls';
import { elevate, font, NUMERIC, RADIUS, TOUCH } from './theme';
import { weatherIconName } from './weatherIcons';

/** The little weather badge beside the map: icon + temperature. Amber when there's a hazard. */
export function WeatherChip({ wx, onPress }: { wx: WeatherState; onPress: () => void }) {
  const t = useTheme();
  const c = wx.shown;
  if (!c) return null;
  const temp = !wx.previewing && wx.current?.tempF != null ? `${Math.round(wx.current.tempF)}°` : '';
  const warn = c.hazard || wx.alerts.length > 0;
  const fg = warn ? t.onAmber : t.text;
  const label = `${c.label}${temp ? `, ${temp.replace('°', ' degrees')}` : ''}${wx.alerts.length ? `, ${wx.alerts.length} weather alert` : ''}${
    wx.previewing ? ', preview' : ''
  }. Tap for weather.`;
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.chip, { backgroundColor: warn ? t.amber : t.bg }, elevate(t, 2)]}
    >
      <Icon name={weatherIconName(c.sky, wx.isDay)} size={24} color={warn ? t.onAmber : t.accent} />
      {temp ? <Text style={[styles.temp, { color: fg }]}>{temp}</Text> : null}
      {wx.alerts.length ? <Icon name="alert" size={20} color={t.onAmber} /> : null}
      {wx.previewing ? <Text style={[styles.tag, { color: warn ? t.onAmber : t.muted }]}>preview</Text> : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: TOUCH - 4,
    minWidth: TOUCH + 8,
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  temp: { fontSize: 18, fontFamily: font('600'), marginLeft: 6, marginRight: 2, ...NUMERIC },
  tag: { fontSize: 12, fontFamily: font('500'), marginLeft: 6 },
});
