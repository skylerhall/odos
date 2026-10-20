import { createContext, useContext, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DAY, TOUCH, type Theme } from './theme';

export const ThemeContext = createContext<Theme>(DAY);
export const useTheme = () => useContext(ThemeContext);

type Tone = 'accent' | 'amber' | 'plain' | 'danger' | 'good';

function toneColors(t: Theme, tone: Tone) {
  switch (tone) {
    case 'accent':
      return { bg: t.accent, fg: t.onAccent, border: t.accent };
    case 'amber':
      return { bg: t.amber, fg: t.onAmber, border: t.amber };
    case 'danger':
      return { bg: t.danger, fg: '#FFFFFF', border: t.danger };
    case 'good':
      return { bg: t.good, fg: '#FFFFFF', border: t.good };
    default:
      return { bg: t.panel, fg: t.text, border: t.border };
  }
}

/** One-tap action. Large, labeled for screen readers, with an icon above the text. */
export function BigButton(props: {
  icon?: string;
  label: string;
  onPress: () => void;
  tone?: Tone;
  hint?: string;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  const t = useTheme();
  const c = toneColors(t, props.tone ?? 'plain');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.big,
        { backgroundColor: c.bg, borderColor: c.border, opacity: props.disabled ? 0.45 : pressed ? 0.75 : 1 },
        props.style,
      ]}
    >
      {props.icon ? <Text style={[styles.bigIcon, { color: c.fg }]}>{props.icon}</Text> : null}
      <Text style={[styles.bigLabel, { color: c.fg }]} numberOfLines={2}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** Round on/off toggle for the map's side rail. Reads as "Voice, on" to screen readers. */
export function RoundToggle(props: { icon: string; label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.on }}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.round,
        {
          backgroundColor: props.on ? t.accent : t.bg,
          borderColor: props.on ? t.accent : t.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={styles.roundIcon}>{props.icon}</Text>
      <Text style={[styles.roundLabel, { color: props.on ? t.onAccent : t.text }]}>{props.label}</Text>
    </Pressable>
  );
}

export function Chip(props: { label: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.on }}
      onPress={props.onPress}
      style={[styles.chip, { backgroundColor: props.on ? t.accent : t.panel, borderColor: props.on ? t.accent : t.border }]}
    >
      <Text style={{ color: props.on ? t.onAccent : t.text, fontSize: 16, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}

/**
 * Bottom sheet built on Modal: big close button, scrollable body. It rises above the on-screen
 * keyboard, and tapping outside it while typing only hides the keyboard (closing would throw away
 * what was typed).
 */
export function Sheet(props: { visible: boolean; title: string; onClose: () => void; children: ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const onBackdrop = () => (Keyboard.isVisible() ? Keyboard.dismiss() : props.onClose());
  return (
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onBackdrop} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior="padding" style={styles.sheetHolder} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: t.text }]} accessibilityRole="header">
              {props.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={props.onClose}
              style={[styles.close, { borderColor: t.border }]}
            >
              <Text style={{ color: t.text, fontSize: 22, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
          {props.scroll === false ? props.children : <ScrollView keyboardShouldPersistTaps="handled">{props.children}</ScrollView>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A row in a results list with an action button on the right (e.g. "+ Add"). */
export function ResultRow(props: { title: string; subtitle?: string; detail?: string; action: string; onAction: () => void; tone?: Tone }) {
  const t = useTheme();
  const c = toneColors(t, props.tone ?? 'accent');
  return (
    <View style={[styles.row, { borderColor: t.border }]}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }} numberOfLines={2}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text style={{ color: t.muted, fontSize: 15, marginTop: 2 }} numberOfLines={2}>
            {props.subtitle}
          </Text>
        ) : null}
        {props.detail ? <Text style={{ color: t.text, fontSize: 15, marginTop: 4, fontWeight: '600' }}>{props.detail}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.action} ${props.title}`}
        onPress={props.onAction}
        style={({ pressed }) => [styles.rowBtn, { backgroundColor: c.bg, opacity: pressed ? 0.75 : 1 }]}
      >
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: '800' }}>{props.action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  big: {
    minHeight: TOUCH + 12,
    minWidth: TOUCH + 12,
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigIcon: { fontSize: 24, marginBottom: 2 },
  bigLabel: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  round: {
    width: TOUCH + 8,
    height: TOUCH + 8,
    borderRadius: (TOUCH + 8) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  roundIcon: { fontSize: 20 },
  roundLabel: { fontSize: 11, fontWeight: '800' },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  // The holder fills the screen and pins the sheet to its bottom edge; KeyboardAvoidingView adds
  // bottom padding equal to the keyboard, which lifts the sheet above it.
  sheetHolder: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { flex: 1, fontSize: 24, fontWeight: '800' },
  close: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  rowBtn: { minHeight: TOUCH, minWidth: 88, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
