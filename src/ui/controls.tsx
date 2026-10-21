import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Animated,
  BackHandler,
  type GestureResponderEvent,
  type HostInstance,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DAY, elevate, font, RADIUS, TOUCH, type Theme } from './theme';

export const ThemeContext = createContext<Theme>(DAY);
export const useTheme = () => useContext(ThemeContext);

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Vector icon: the same look on every phone (emoji differ by brand and feel toy-like). */
export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable that dips slightly when pressed and springs back, so every tap feels physical.
 * Uses transform only (runs on the native thread).
 */
export function PressScale(props: Omit<ComponentProps<typeof Pressable>, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const { style, scaleTo = 0.96, onPressIn, onPressOut, ...rest } = props;
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v === 1 ? 6 : 0 }).start();
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        to(1);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }] }]}
    />
  );
}

type Tone = 'accent' | 'amber' | 'plain' | 'danger' | 'good' | 'soft';

function toneColors(t: Theme, tone: Tone) {
  switch (tone) {
    case 'accent':
      return { bg: t.accent, fg: t.onAccent };
    case 'amber':
      return { bg: t.amber, fg: t.onAmber };
    case 'danger':
      return { bg: t.danger, fg: '#FFFFFF' };
    case 'good':
      return { bg: t.good, fg: '#FFFFFF' };
    case 'soft':
      return { bg: t.accentSoft, fg: t.accent };
    default:
      return { bg: t.panel, fg: t.text };
  }
}

/**
 * Main button. Filled for the primary action, soft gray for secondary ones; no outlines.
 * Icon sits beside the label (or above it with `stacked`).
 */
export function BigButton(props: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  tone?: Tone;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  stacked?: boolean;
}) {
  const t = useTheme();
  const c = toneColors(t, props.tone ?? 'plain');
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.big,
        props.stacked ? styles.bigStacked : null,
        { backgroundColor: c.bg, opacity: props.disabled ? 0.45 : 1 },
        props.style,
      ]}
    >
      {props.icon ? <Icon name={props.icon} size={props.stacked ? 26 : 22} color={c.fg} /> : null}
      <Text
        style={[
          styles.bigLabel,
          { color: c.fg },
          props.icon && !props.stacked ? { marginLeft: 8 } : null,
          props.stacked ? { marginTop: 4 } : null,
        ]}
        numberOfLines={2}
      >
        {props.label}
      </Text>
    </PressScale>
  );
}

/** Square-ish icon-only button for tight spots. The label is for screen readers. */
export function IconButton(props: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      scaleTo={0.9}
      style={[styles.iconBtn, { backgroundColor: t.panel }]}
    >
      <Icon name={props.icon} size={24} color={props.icon === 'close' ? t.muted : t.text} />
    </PressScale>
  );
}

/** Quick action in the bottom bar: a tinted icon well with a short label under it. */
export function ActionTile(props: { icon: IconName; label: string; onPress: () => void; hint?: string; tone?: 'accent' | 'amber' | 'brand' }) {
  const t = useTheme();
  const amber = props.tone === 'amber';
  const brand = props.tone === 'brand';
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      onPress={props.onPress}
      scaleTo={0.92}
      style={styles.tile}
    >
      <View style={[styles.tileWell, { backgroundColor: amber ? t.amber : brand ? t.brand : t.accentSoft }]}>
        <Icon name={props.icon} size={24} color={amber ? t.onAmber : brand ? t.onAccent : t.accent} />
      </View>
      <Text style={[styles.tileLabel, { color: t.text }]} numberOfLines={1}>
        {props.label}
      </Text>
    </PressScale>
  );
}

/** Floating card that groups the map's on/off toggles, Google Maps style. */
export function Rail({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.rail, { backgroundColor: t.bg }, elevate(t, 2)]}>{children}</View>;
}

/** One on/off toggle inside the Rail. Reads as "Voice, switch, on" to screen readers. */
export function RoundToggle(props: {
  icon: IconName;
  label: string;
  on: boolean;
  onPress: () => void;
  /** Strike the icon through (e.g. tolls avoided). */
  slash?: boolean;
  /** Spoken name when it differs from the label shown (which may change with the state). */
  a11yLabel?: string;
}) {
  const t = useTheme();
  const color = props.on ? t.brandText : t.muted;
  const wellBg = props.on ? t.brandSoft : t.bg;
  return (
    <PressScale
      accessibilityRole="switch"
      accessibilityLabel={props.a11yLabel ?? props.label}
      accessibilityState={{ checked: props.on }}
      onPress={props.onPress}
      scaleTo={0.9}
      style={styles.toggle}
    >
      <View style={[styles.toggleWell, { backgroundColor: props.on ? t.brandSoft : 'transparent' }]}>
        <Icon name={props.icon} size={24} color={color} />
        {props.slash ? <View style={[styles.slash, { backgroundColor: color, borderColor: wellBg }]} /> : null}
      </View>
      <Text style={[styles.toggleLabel, { color }]}>{props.label}</Text>
    </PressScale>
  );
}

export function Chip(props: { label: string; on?: boolean; onPress: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.on }}
      onPress={props.onPress}
      style={[styles.chip, { backgroundColor: props.on ? t.accent : t.panel }]}
    >
      {props.icon ? <Icon name={props.icon} size={18} color={props.on ? t.onAccent : t.muted} /> : null}
      <Text style={[styles.chipLabel, { color: props.on ? t.onAccent : t.text }, props.icon ? { marginLeft: 6 } : null]}>
        {props.label}
      </Text>
    </PressScale>
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
 * Android back button closes it. Slides up when it opens.
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
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!props.visible) return;
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose.current();
      return true;
    });
    return () => sub.remove();
  }, [props.visible, enter]);

  if (!props.visible) return null;
  const onBackdrop = () => (Keyboard.isVisible() ? Keyboard.dismiss() : props.onClose());
  // Leave room for the status bar above, and the keyboard (or the gesture bar) below.
  const maxHeight = Math.max(200, screenH - overlap - insets.top - 24);
  return (
    <View ref={holder} onLayout={onLayout} style={styles.sheetLayer}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay, opacity: enter }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onBackdrop} accessibilityLabel="Close" />
      </Animated.View>
      <View style={[styles.sheetHolder, { paddingBottom: overlap }]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            elevate(t, 3),
            {
              maxHeight,
              backgroundColor: t.bg,
              paddingBottom: overlap > 0 ? 12 : insets.bottom + 12,
              transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
              opacity: enter,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.border }]} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: t.text }]} accessibilityRole="header">
              {props.title}
            </Text>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={props.onClose}
              scaleTo={0.9}
              style={[styles.close, { backgroundColor: t.panel }]}
            >
              <Icon name="close" size={24} color={t.text} />
            </PressScale>
          </View>
          {props.scroll === false ? props.children : <ScrollView keyboardShouldPersistTaps="handled">{props.children}</ScrollView>}
        </Animated.View>
      </View>
    </View>
  );
}

/** A row in a results list with an action button on the right (e.g. "+ Add"). */
export function ResultRow(props: {
  title: string;
  subtitle?: string;
  detail?: string;
  action: string;
  onAction: () => void;
  tone?: Tone;
  /** Optional leading icon in a soft well (what kind of place this is). */
  icon?: IconName;
  iconTone?: 'accent' | 'amber';
}) {
  const t = useTheme();
  const c = toneColors(t, props.tone === 'plain' ? 'soft' : (props.tone ?? 'accent'));
  return (
    <View style={[styles.row, { borderColor: t.border }]}>
      {props.icon ? (
        <View style={[styles.rowWell, { backgroundColor: props.iconTone === 'amber' ? t.amberSoft : t.accentSoft }]}>
          <Icon name={props.icon} size={22} color={props.iconTone === 'amber' ? t.amber : t.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, paddingRight: 12 }}>
        {props.title ? (
          <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={2}>
            {props.title}
          </Text>
        ) : null}
        {props.subtitle ? (
          <Text style={[styles.rowSub, { color: t.muted }]} numberOfLines={2}>
            {props.subtitle}
          </Text>
        ) : null}
        {props.detail ? <Text style={[styles.rowDetail, { color: t.text }]}>{props.detail}</Text> : null}
      </View>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${props.action} ${props.title}`}
        onPress={props.onAction}
        style={[styles.rowBtn, { backgroundColor: c.bg }]}
      >
        <Text style={[styles.rowBtnLabel, { color: c.fg }]}>{props.action}</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  big: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    borderRadius: RADIUS.control,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  bigStacked: { flexDirection: 'column', paddingHorizontal: 8, minHeight: TOUCH + 12 },
  bigLabel: { fontSize: 16, fontFamily: font('600'), textAlign: 'center', letterSpacing: -0.1 },
  iconBtn: { width: TOUCH, height: TOUCH, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  tile: { flex: 1, alignItems: 'center', minHeight: TOUCH + 18, justifyContent: 'center', paddingVertical: 4 },
  tileWell: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 13, fontFamily: font('500'), marginTop: 6 },
  rail: { borderRadius: RADIUS.card, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' },
  toggle: { width: TOUCH + 8, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  toggleWell: { width: 44, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // A "not" slash from top-left to bottom-right, edged in the well color so it reads over the icon.
  slash: { position: 'absolute', width: 32, height: 5, borderRadius: 2.5, borderWidth: 1.5, transform: [{ rotate: '45deg' }] },
  toggleLabel: { fontSize: 11, fontFamily: font('600'), marginTop: 2, letterSpacing: 0.2 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: RADIUS.chip,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  chipLabel: { fontSize: 16, fontFamily: font('500') },
  // Covers the whole app, above the map and panels (Android draws higher elevation on top).
  sheetLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100 },
  // Pins the sheet to the bottom; bottom padding equal to the keyboard overlap lifts it above.
  sheetHolder: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, paddingHorizontal: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { flex: 1, fontSize: 24, fontFamily: font('700'), letterSpacing: -0.4 },
  close: { width: TOUCH - 8, height: TOUCH - 8, borderRadius: (TOUCH - 8) / 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowWell: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTitle: { fontSize: 17, fontFamily: font('600'), letterSpacing: -0.2 },
  rowSub: { fontSize: 15, fontFamily: font('400'), marginTop: 2, lineHeight: 20 },
  rowDetail: { fontSize: 14, fontFamily: font('500'), marginTop: 4 },
  rowBtn: { minHeight: 48, minWidth: 84, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  rowBtnLabel: { fontSize: 16, fontFamily: font('600') },
});
