import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './controls';
import { font } from './theme';

/**
 * The grab bar on top of the bottom panel. Tap it or swipe down to minimize the panel, tap or
 * swipe up to bring it back. Swipes are picked up even when they start on the button.
 * `onChange` should be stable (useCallback) so the gesture handler isn't rebuilt every render.
 */
export function PanelHandle({ minimized, onChange }: { minimized: boolean; onChange: (min: boolean) => void }) {
  const t = useTheme();
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 24) onChange(true);
          else if (g.dy < -24) onChange(false);
        },
      }),
    [onChange],
  );
  return (
    <View {...pan.panHandlers} style={styles.wrap}>
      <Pressable
        onPress={() => onChange(!minimized)}
        accessibilityRole="button"
        accessibilityLabel={minimized ? 'Show menu' : 'Minimize menu'}
        accessibilityHint={minimized ? 'Shows the full panel' : 'Shrinks the panel so you can see more map'}
        style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={[styles.bar, { backgroundColor: t.border }]} />
        <Text style={[styles.label, { color: t.muted }]}>{minimized ? '▲ Show menu' : '▼ Minimize'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: -6, marginBottom: 2 },
  // Wide and tall enough to hit without looking (WCAG target size, gloves).
  btn: { minHeight: 44, minWidth: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  bar: { width: 48, height: 5, borderRadius: 3, marginBottom: 4 },
  label: { fontSize: 13, fontFamily: font('700') },
});
