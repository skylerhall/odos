import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './controls';
import { elevate, font, NUMERIC } from './theme';

/** Over the posted limit by more than this, the speed turns red. */
const OVER_MPH = 5;

/**
 * Current speed from GPS, with the posted limit beside it when the route knows it (a US-style
 * white "SPEED LIMIT" sign). Display only: screen readers get one combined label.
 */
export function Speedometer({ mph, limit }: { mph: number; limit: number | null }) {
  const t = useTheme();
  const speed = Math.round(mph);
  const over = limit != null && speed > limit + OVER_MPH;
  return (
    <View
      style={styles.row}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Speed ${speed} miles per hour${limit != null ? `, limit ${limit}${over ? ', over the limit' : ''}` : ''}`}
    >
      <View style={[styles.dial, { backgroundColor: over ? t.danger : t.bg, borderColor: over ? t.danger : t.border }, elevate(t, 2)]}>
        <Text style={[styles.speed, { color: over ? t.onAccent : t.text }]}>{speed}</Text>
        <Text style={[styles.unit, { color: over ? t.onAccent : t.muted }]}>mph</Text>
      </View>
      {limit != null ? (
        // Road signs look the same day and night, so this ignores the theme on purpose.
        <View style={[styles.sign, elevate(t, 2)]}>
          <Text style={styles.signTop}>SPEED{'\n'}LIMIT</Text>
          <Text style={styles.signNum}>{limit}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  dial: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  speed: { fontSize: 28, lineHeight: 30, fontFamily: font('800'), letterSpacing: -0.8, ...NUMERIC },
  unit: { fontSize: 12, fontFamily: font('600'), marginTop: -2 },
  sign: {
    marginLeft: 8,
    width: 52,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  signTop: { color: '#111111', fontSize: 9, lineHeight: 10, textAlign: 'center', fontFamily: font('700'), letterSpacing: 0.3 },
  signNum: { color: '#111111', fontSize: 24, lineHeight: 26, fontFamily: font('800'), ...NUMERIC },
});
