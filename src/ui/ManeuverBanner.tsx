import { StyleSheet, Text, View } from 'react-native';
import type { Progress } from '../core/nav';
import { Icon, useTheme } from './controls';
import { distance, maneuverGlyph } from './format';
import { elevate, font, NUMERIC, RADIUS } from './theme';

/** Top of screen while driving: the next turn and how far to it, kept compact so the map shows. */
export function ManeuverBanner({ progress, rerouting }: { progress: Progress | null; rerouting: boolean }) {
  const t = useTheme();
  if (!progress) {
    return (
      <View style={[styles.banner, { backgroundColor: t.banner }, elevate(t, 2)]}>
        <Icon name="navigation-variant" size={24} color={t.brand} />
        <Text style={[styles.instruction, { color: t.onBanner, marginLeft: 12 }]}>
          {rerouting ? 'Finding the best route…' : 'Starting route…'}
        </Text>
      </View>
    );
  }
  const target = progress.next ?? progress.step;
  const m = target.maneuver;
  const say = `${m.instruction}, in ${distance(progress.toManeuver)}`;
  return (
    <View style={[styles.banner, { backgroundColor: t.banner }, elevate(t, 2)]} accessible accessibilityRole="header" accessibilityLabel={say}>
      <View style={[styles.glyphWell, { backgroundColor: t.brand }]}>
        <Icon name={maneuverGlyph(m.type, m.modifier)} size={30} color={t.onAccent} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.dist, { color: t.onBanner }]}>{distance(progress.toManeuver)}</Text>
        <Text style={[styles.instruction, { color: t.onBanner }]} numberOfLines={2}>
          {m.instruction}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.card, paddingVertical: 10, paddingHorizontal: 12 },
  glyphWell: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dist: { fontSize: 24, lineHeight: 28, fontFamily: font('700'), letterSpacing: -0.6, ...NUMERIC },
  instruction: { fontSize: 15, fontFamily: font('500'), lineHeight: 19, opacity: 0.92 },
});
