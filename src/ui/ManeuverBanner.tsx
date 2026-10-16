import { StyleSheet, Text, View } from 'react-native';
import { laneName } from '../core/lanes';
import type { Progress } from '../core/nav';
import type { LaneView } from '../state/useOdos';
import { useTheme } from './controls';
import { distance, laneGlyph, maneuverGlyph } from './format';

/** Top of screen while driving: the next turn, big, then the lane strip under it. */
export function ManeuverBanner({ progress, lanes, rerouting }: { progress: Progress | null; lanes: LaneView | null; rerouting: boolean }) {
  const t = useTheme();
  if (!progress) {
    return (
      <View style={[styles.banner, { backgroundColor: t.banner }]}>
        <Text style={[styles.instruction, { color: t.onBanner }]}>{rerouting ? 'Finding the best route…' : 'Starting route…'}</Text>
      </View>
    );
  }
  const target = progress.next ?? progress.step;
  const m = target.maneuver;
  const say = `${m.instruction}, in ${distance(progress.toManeuver)}`;
  return (
    <View>
      <View style={[styles.banner, { backgroundColor: t.banner }]} accessible accessibilityRole="header" accessibilityLabel={say}>
        <Text style={[styles.glyph, { color: t.onBanner }]}>{maneuverGlyph(m.type, m.modifier)}</Text>
        <View style={{ flex: 1 }}>
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
    <View style={[styles.strip, { backgroundColor: t.bg, borderColor: t.border }]}>
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
              style={[
                styles.lane,
                {
                  borderColor: isBest ? t.good : t.border,
                  backgroundColor: isBest ? t.good : valid ? t.panel : t.bg,
                  opacity: valid ? 1 : 0.4,
                },
              ]}
            >
              <Text style={[styles.laneGlyph, { color: isBest ? '#FFFFFF' : t.text }]}>{laneGlyph(guide?.indications ?? ['straight'])}</Text>
              {score != null ? <Text style={[styles.laneMph, { color: isBest ? '#FFFFFF' : t.muted }]}>{Math.round(score)}</Text> : null}
            </View>
          );
        })}
      </View>
      <Text style={[styles.laneReason, { color: advice?.flip ? t.amber : t.text }]} numberOfLines={2}>
        {advice
          ? advice.changeTo != null
            ? `Move to ${laneName(advice.changeTo, lanes.count).toLowerCase()} — ${advice.reason}`
            : advice.reason
          : lanes.guides
            ? `Lanes for the next turn${lanes.inMeters != null ? ` in ${distance(lanes.inMeters)}` : ''}`
            : 'Lane guidance'}
        {lanes.simulated ? '  · simulated speeds' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  glyph: { fontSize: 48, width: 64, textAlign: 'center', fontWeight: '900' },
  dist: { fontSize: 30, fontWeight: '900' },
  instruction: { fontSize: 20, fontWeight: '700' },
  strip: { marginTop: 6, borderRadius: 14, borderWidth: 2, padding: 8 },
  laneRow: { flexDirection: 'row', justifyContent: 'center' },
  lane: { minWidth: 52, height: 56, borderRadius: 10, borderWidth: 2, marginHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  laneGlyph: { fontSize: 24, fontWeight: '900' },
  laneMph: { fontSize: 11, fontWeight: '700' },
  laneReason: { textAlign: 'center', fontSize: 15, fontWeight: '700', marginTop: 6 },
});
