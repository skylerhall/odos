import { StyleSheet, Text, View } from 'react-native';
import { laneName } from '../core/lanes';
import type { Progress } from '../core/nav';
import type { LaneView } from '../state/useOdos';
import { Icon, useTheme } from './controls';
import { distance, laneGlyph, maneuverGlyph } from './format';
import { elevate, font, NUMERIC, RADIUS } from './theme';

/** Top of screen while driving: the next turn, big, then the lane strip under it. */
export function ManeuverBanner({ progress, lanes, rerouting }: { progress: Progress | null; lanes: LaneView | null; rerouting: boolean }) {
  const t = useTheme();
  if (!progress) {
    return (
      <View style={[styles.banner, { backgroundColor: t.banner }, elevate(t, 2)]}>
        <Icon name="navigation-variant" size={28} color={t.accent} />
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
    <View>
      <View
        style={[styles.banner, { backgroundColor: t.banner }, elevate(t, 2)]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={say}
      >
        <View style={[styles.glyphWell, { backgroundColor: t.accent }]}>
          <Icon name={maneuverGlyph(m.type, m.modifier)} size={40} color={t.onAccent} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={[styles.dist, { color: t.onBanner }]}>{distance(progress.toManeuver)}</Text>
          <Text style={[styles.instruction, { color: t.onBanner }]} numberOfLines={2}>
            {m.instruction}
          </Text>
        </View>
      </View>
      {lanes ? <LaneStrip lanes={lanes} /> : null}
    </View>
  );
}

function LaneStrip({ lanes }: { lanes: LaneView }) {
  const t = useTheme();
  const advice = lanes.advice;
  const best = advice?.best ?? null;
  return (
    <View style={[styles.strip, { backgroundColor: t.bg }, elevate(t, 1)]}>
      <View style={styles.laneRow}>
        {Array.from({ length: lanes.count }, (_, i) => {
          const guide = lanes.guides?.[i];
          const valid = guide ? guide.valid : true;
          const isBest = best === i;
          const score = advice?.scores[i]?.score;
          return (
            <View
              key={i}
              accessible
              accessibilityLabel={`${laneName(i, lanes.count)}${valid ? '' : ', wrong lane for next turn'}${isBest ? ', recommended' : ''}`}
              style={[styles.lane, { backgroundColor: isBest ? t.good : valid ? t.panel : 'transparent', opacity: valid ? 1 : 0.35 }]}
            >
              <Icon name={laneGlyph(guide?.indications ?? ['straight'])} size={26} color={isBest ? '#FFFFFF' : t.text} />
              {score != null ? <Text style={[styles.laneMph, { color: isBest ? '#FFFFFF' : t.muted }]}>{Math.round(score)}</Text> : null}
            </View>
          );
        })}
      </View>
      <Text style={[styles.laneReason, { color: advice?.flip ? t.amber : t.text }]} numberOfLines={2}>
        {advice
          ? advice.changeTo != null
            ? `Move to ${laneName(advice.changeTo, lanes.count).toLowerCase()} · ${advice.reason}`
            : advice.reason
          : lanes.guides
            ? `Lanes for the next turn${lanes.inMeters != null ? ` in ${distance(lanes.inMeters)}` : ''}`
            : 'Lane guidance'}
        {lanes.simulated ? <Text style={{ color: t.muted, fontFamily: font('400') }}> · simulated</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.card, paddingVertical: 14, paddingHorizontal: 14 },
  glyphWell: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dist: { fontSize: 32, fontFamily: font('700'), letterSpacing: -0.8, ...NUMERIC },
  instruction: { fontSize: 18, fontFamily: font('500'), lineHeight: 23, opacity: 0.92 },
  strip: { marginTop: 8, borderRadius: RADIUS.control + 2, paddingVertical: 10, paddingHorizontal: 8 },
  laneRow: { flexDirection: 'row', justifyContent: 'center' },
  lane: { minWidth: 50, height: 56, borderRadius: 12, marginHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  laneMph: { fontSize: 11, fontFamily: font('600'), ...NUMERIC },
  laneReason: { textAlign: 'center', fontSize: 14, fontFamily: font('600'), marginTop: 8 },
});
