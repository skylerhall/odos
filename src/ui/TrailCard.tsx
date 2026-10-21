import { StyleSheet, Text, View } from 'react-native';
import { MI } from '../core/geo';
import type { TrailState } from '../state/useTrail';
import { Icon, PressScale, useTheme } from './controls';
import { distance } from './format';
import { elevate, font, NUMERIC, RADIUS } from './theme';

/**
 * On the map in Trail Mode (when not following a route): mode, distance tracked, dead-end/gate
 * warnings ahead, and a compass arrow to the destination when no trail leads there.
 */
export function TrailCard(props: {
  trail: TrailState;
  heading: number | null;
  destinationName: string | null;
  onOpen: () => void;
  onRetryRoute: () => void;
}) {
  const t = useTheme();
  const { trail } = props;
  const ahead = trail.ahead;
  const c = trail.compass;
  const warning =
    ahead?.deadEndM != null ? `Dead end in ${distance(ahead.deadEndM)}` : ahead?.gateM != null ? `Gate in ${distance(ahead.gateM)}` : null;
  // Arrow relative to where you're facing, so "up" means straight ahead.
  const rotate = c ? `${Math.round(c.bearing - (props.heading ?? 0))}deg` : '0deg';

  return (
    <View style={[styles.card, { backgroundColor: t.bg }, elevate(t, 2)]}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`Trail Mode, ${trail.mode === 'hike' ? 'on foot' : 'off-road'}, ${(trail.track.meters / MI).toFixed(1)} miles tracked`}
        accessibilityHint="Opens Trail Mode"
        onPress={props.onOpen}
        scaleTo={0.98}
        style={styles.row}
      >
        <View style={[styles.well, { backgroundColor: t.brand }]}>
          <Icon name={trail.mode === 'hike' ? 'hiking' : 'jeepney'} size={22} color={t.onAccent} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.title, { color: t.text }]}>Trail Mode · {trail.mode === 'hike' ? 'On foot' : 'Off-road'}</Text>
          <Text style={[styles.sub, { color: t.muted }]}>{(trail.track.meters / MI).toFixed(2)} mi tracked</Text>
        </View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="Back to start"
          accessibilityHint="Follow your track back to where Trail Mode started"
          onPress={trail.backToStart}
          scaleTo={0.92}
          style={[styles.back, { backgroundColor: t.accentSoft }]}
        >
          <Icon name="home-import-outline" size={22} color={t.accent} />
          <Text style={[styles.backText, { color: t.accent }]}>Back</Text>
        </PressScale>
      </PressScale>

      {warning ? (
        <View style={[styles.line, { backgroundColor: t.amberSoft }]} accessible accessibilityLiveRegion="polite">
          <Icon name={ahead?.deadEndM != null ? 'sign-direction' : 'gate'} size={20} color={t.onAmber} />
          <Text style={[styles.lineText, { color: t.onAmber }]}>{warning}</Text>
        </View>
      ) : null}

      {c ? (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={`${props.destinationName ?? 'Destination'} is ${distance(c.meters)} ${c.point}, no trail leads there. Tap to try a trail route again.`}
          onPress={props.onRetryRoute}
          style={[styles.line, { backgroundColor: t.panel }]}
        >
          <View style={{ transform: [{ rotate }] }}>
            <Icon name="navigation-variant" size={24} color={t.brand} />
          </View>
          <Text style={[styles.lineText, { color: t.text }]} numberOfLines={1}>
            {distance(c.meters)} {c.point} to {props.destinationName ?? 'destination'}
          </Text>
          <Text style={[styles.retry, { color: t.accent }]}>Retry</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, padding: 10, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  well: { width: 44, height: 44, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontFamily: font('700') },
  sub: { fontSize: 14, fontFamily: font('500'), ...NUMERIC },
  back: { width: 64, minHeight: 56, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 12, fontFamily: font('700'), marginTop: 1 },
  line: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: RADIUS.chip, paddingHorizontal: 12, marginTop: 8 },
  lineText: { flex: 1, fontSize: 16, fontFamily: font('700'), marginLeft: 10, ...NUMERIC },
  retry: { fontSize: 15, fontFamily: font('700'), marginLeft: 8 },
});
