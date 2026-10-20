import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BackHandler,
  type HostInstance,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
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
 * Where the on-screen keyboard's top edge is relative to a view: how many pixels of the view the
 * keyboard covers. Measured from the real keyboard frame, so it is right whether or not Android
 * resizes the window for the keyboard (edge-to-edge apps don't get resized).
 */
function useKeyboardOverlap(ref: RefObject<HostInstance | null>) {
  const [overlap, setOverlap] = useState(0);
  const keyboardTop = useRef<number | null>(null);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    if (top == null) return setOverlap(0);
    ref.current?.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, Math.round(y + h - top))));
  }, [ref]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const { screenY, height } = e.endCoordinates;
      if (!ref.current || screenY <= 0) {
        keyboardTop.current = null;
        setOverlap(height);
        return;
      }
      keyboardTop.current = screenY;
      measure();
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardTop.current = null;
      setOverlap(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref, measure]);

  // If the window does get resized for the keyboard, re-measure once the new layout lands.
  return { overlap, onLayout: measure };
}

/**
 * Bottom sheet drawn over the app (not a separate Android window, where the keyboard can't be
 * tracked). It rises above the on-screen keyboard and shrinks to fit the space left, tapping
 * outside while typing only hides the keyboard (closing would throw away what was typed), and the
 * Android back button closes it.
 */
export function Sheet(props: { visible: boolean; title: string; onClose: () => void; children: ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const holder = useRef<HostInstance>(null);
  const { overlap, onLayout } = useKeyboardOverlap(holder);
  const onClose = useRef(props.onClose);
  useLayoutEffect(() => {
    onClose.current = props.onClose;
  });

  useEffect(() => {
    if (!props.visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose.current();
      return true;
    });
    return () => sub.remove();
  }, [props.visible]);

  if (!props.visible) return null;
  const onBackdrop = () => (Keyboard.isVisible() ? Keyboard.dismiss() : props.onClose());
  // Leave room for the status bar above, and the keyboard (or the gesture bar) below.
  const maxHeight = Math.max(200, screenH - overlap - insets.top - 24);
  return (
    <View ref={holder} onLayout={onLayout} style={styles.sheetLayer}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onBackdrop} accessibilityLabel="Close" />
      <View style={[styles.sheetHolder, { paddingBottom: overlap }]} pointerEvents="box-none">
        <View style={[styles.sheet, { maxHeight, backgroundColor: t.bg, paddingBottom: overlap > 0 ? 12 : insets.bottom + 12 }]}>
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
      </View>
    </View>
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
  // Covers the whole app, above the map and panels (Android draws higher elevation on top).
  sheetLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100 },
  // Pins the sheet to the bottom; bottom padding equal to the keyboard overlap lifts it above.
  sheetHolder: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { flex: 1, fontSize: 24, fontWeight: '800' },
  close: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  rowBtn: { minHeight: TOUCH, minWidth: 88, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
