import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './controls';
import { elevate, font, NUMERIC } from './theme';

/** Over the posted limit by more than this, the speed turns red. */
const OVER_MPH = 5;

/**
 * Current speed from GPS and, when the route knows it, the posted limit, in one small capsule:
 * speed on the left, a little US-style white limit sign tucked in on the right. Display only:
 * screen readers get one combined label.
 */
export function Speedometer({ mph, limit }: { mph: number; limit: number | null }) {
  const t = useTheme();
  const speed = Math.round(mph);
  const over = limit != null && speed > limit + OVER_MPH;
  const fg = over ? t.onAccent : t.text;
  return (
    <View
      style={[styles.capsule, { backgroundColor: over ? t.danger : t.bg, borderColor: over ? t.danger : t.brand }, elevate(t, 2)]}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Speed ${speed} miles per hour${limit != null ? `, limit ${limit}${over ? ', over the limit' : ''}` : ''}`}
    >
      <View style={styles.speedBox}>
        <Text style={[styles.speed, { color: fg }]}>{speed}</Text>
        <Text style={[styles.unit, { color: over ? t.onAccent : t.muted }]}>MPH</Text>
      </View>
      {limit != null ? (
        // Road signs look the same day and night, so this ignores the theme on purpose.
        <View style={styles.sign}>
          <Text style={styles.signTop}>LIMIT</Text>
          <Text style={styles.signNum}>{limit}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    paddingLeft: 12,
    paddingRight: 5,
  },
  speedBox: { flexDirection: 'row', alignItems: 'baseline', minWidth: 44, paddingRight: 8 },
  speed: { fontSize: 24, lineHeight: 28, fontFamily: font('800'), letterSpacing: -0.6, ...NUMERIC },
  unit: { fontSize: 9, fontFamily: font('700'), letterSpacing: 0.4, marginLeft: 3 },
  sign: {
    width: 32,
    height: 38,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signTop: { color: '#111111', fontSize: 6.5, lineHeight: 7, fontFamily: font('700'), letterSpacing: 0.3 },
  signNum: { color: '#111111', fontSize: 15, lineHeight: 16, fontFamily: font('800'), ...NUMERIC },
});
