import { Pressable, StyleSheet, Text } from 'react-native';
import { weatherIcon } from '../core/weather';
import type { WeatherState } from '../state/useWeather';
import { useTheme } from './controls';
import { TOUCH } from './theme';

/** The little weather badge beside the map: icon + temperature. Amber when there's a hazard. */
export function WeatherChip({ wx, onPress }: { wx: WeatherState; onPress: () => void }) {
  const t = useTheme();
  const c = wx.shown;
  if (!c) return null;
  const temp = !wx.previewing && wx.current?.tempF != null ? `${Math.round(wx.current.tempF)}°` : '';
  const warn = c.hazard || wx.alerts.length > 0;
  const label = `${c.label}${temp ? `, ${temp.replace('°', ' degrees')}` : ''}${wx.alerts.length ? `, ${wx.alerts.length} weather alert` : ''}${
    wx.previewing ? ', preview' : ''
  }. Tap for weather.`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: warn ? t.amber : t.bg, borderColor: warn ? t.amber : t.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={styles.icon}>{weatherIcon(c.sky, wx.isDay)}</Text>
      {temp ? <Text style={[styles.temp, { color: warn ? t.onAmber : t.text }]}>{temp}</Text> : null}
      {wx.alerts.length ? <Text style={[styles.temp, { color: t.onAmber }]}>⚠️</Text> : null}
      {wx.previewing ? <Text style={[styles.tag, { color: warn ? t.onAmber : t.muted }]}>preview</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: TOUCH,
    minWidth: TOUCH + 8,
    alignSelf: 'flex-start',
    borderRadius: TOUCH / 2,
    borderWidth: 2,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  icon: { fontSize: 26 },
  temp: { fontSize: 20, fontWeight: '900', marginLeft: 6 },
  tag: { fontSize: 12, fontWeight: '800', marginLeft: 6 },
});
