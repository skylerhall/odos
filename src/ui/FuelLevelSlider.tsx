import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { EIGHTHS, gaugeLabel } from '../core/fuel';
import { useTheme } from './controls';
import { font, NUMERIC } from './theme';

const THUMB = 34;

/**
 * Tank level in eighths, like a fuel gauge. Drag or tap anywhere on the track; it snaps to the
 * nearest eighth with a tick of haptic feedback. Screen readers get an adjustable control
 * ("three eighths", swipe up/down to change). `onChange` should be stable (a state setter).
 */
export function FuelLevelSlider({ value, onChange, ev }: { value: number; onChange: (eighths: number) => void; ev?: boolean }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);

  const pan = useMemo(() => {
    // Per-gesture drag state: where the finger went down, and the last eighth reported.
    const drag = { startX: 0, last: -1 };
    const emit = (x: number) => {
      if (width <= 0) return;
      const e = Math.round(Math.max(0, Math.min(1, x / width)) * EIGHTHS);
      if (e === drag.last) return;
      drag.last = e;
      Haptics.selectionAsync().catch(() => {});
      onChange(e);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the drag even if the sheet's scroll view would like to take over.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        drag.startX = evt.nativeEvent.locationX - THUMB / 2;
        drag.last = -1;
        emit(drag.startX);
      },
      onPanResponderMove: (_evt, g) => emit(drag.startX + g.dx),
    });
  }, [width, onChange]);

  const step = (d: number) => {
    const next = Math.max(0, Math.min(EIGHTHS, value + d));
    if (next !== value) onChange(next);
  };
  const low = value <= 2;
  const fillColor = low ? t.amber : t.accent;
  const x = (value / EIGHTHS) * width;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={ev ? 'Battery level' : 'Fuel level'}
      accessibilityValue={{ text: ev ? gaugeLabel(value, true) : `${gaugeLabel(value, false, true)} tank` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <View {...pan.panHandlers} style={styles.touch}>
        <View pointerEvents="none" style={styles.inner} onLayout={(e) => setWidth(e.nativeEvent.layout.width - THUMB)}>
          <View style={[styles.track, { backgroundColor: t.panel }]}>
            <View style={[styles.fill, { width: value === 0 ? 0 : x + 4, backgroundColor: fillColor }]} />
          </View>
          {Array.from({ length: EIGHTHS + 1 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                {
                  left: THUMB / 2 + (i / EIGHTHS) * width - 1,
                  height: i % 2 === 0 ? 14 : 8,
                  top: (THUMB - (i % 2 === 0 ? 14 : 8)) / 2,
                  backgroundColor: i <= value ? t.onAccent : t.border,
                  opacity: i <= value ? 0.7 : 1,
                },
              ]}
            />
          ))}
          <View style={[styles.thumb, { left: x, backgroundColor: t.bg, borderColor: fillColor }]} />
        </View>
      </View>
      <View style={styles.labels} pointerEvents="none">
        {[0, 2, 4, 6, 8].map((i) => (
          <Text
            key={i}
            style={[
              styles.label,
              { left: THUMB / 2 + (i / EIGHTHS) * width - 24, color: i === value ? t.text : t.muted, fontFamily: font(i === value ? '700' : '500') },
            ]}
          >
            {gaugeLabel(i, ev)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Tall touch area so the slider is easy to grab without looking closely.
  touch: { height: 64, justifyContent: 'center' },
  inner: { height: THUMB, justifyContent: 'center' },
  track: { marginHorizontal: THUMB / 2 - 4, height: 14, borderRadius: 7, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 7 },
  tick: { position: 'absolute', width: 2, borderRadius: 1 },
  thumb: { position: 'absolute', top: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 4 },
  labels: { height: 22 },
  label: { position: 'absolute', width: 48, textAlign: 'center', fontSize: 14, ...NUMERIC },
});
