// Design tokens. A calm blue for actions, ODOS orange (from the icon) for the brand touches:
// the turn arrow, your position, active toggles, the speedometer. One cool-gray family; semantic
// amber/red/green used only for meaning (fuel, danger, arrival). High contrast and big targets: ODOS is read at a
// glance, often one-handed, sometimes in gloves.

import type { TextStyle, ViewStyle } from 'react-native';

export type Theme = typeof DAY;

export const DAY = {
  /** Sheets and floating cards. */
  bg: '#FFFFFF',
  /** Recessed fills: soft buttons, inputs, tracks. */
  panel: '#F0F3F7',
  text: '#0F1722',
  muted: '#5B6676',
  border: '#E1E6ED',
  accent: '#2F6BDB',
  accentSoft: '#E6EEFC',
  onAccent: '#FFFFFF',
  /** ODOS orange: icons, fills and large type. */
  brand: '#F45A0C',
  /** Deeper orange for small text on light backgrounds (4.5:1 on white). */
  brandText: '#C24705',
  brandSoft: '#FFE9DC',
  amber: '#E39B12',
  amberSoft: '#FCF0D7',
  onAmber: '#241800',
  danger: '#CF423A',
  dangerSoft: '#FBE7E5',
  good: '#1E9A62',
  /** Turn-by-turn banner: dark ink so it reads over any map. */
  banner: '#13202F',
  onBanner: '#FFFFFF',
  overlay: 'rgba(10, 18, 30, 0.38)',
  /** Shadows are tinted toward the ink color, never pure black. */
  shadow: '#0B1A33',
};

export const NIGHT: Theme = {
  bg: '#141B25',
  panel: '#1D2633',
  text: '#EEF2F7',
  muted: '#9AA6B6',
  border: '#2A3546',
  accent: '#77A2F4',
  accentSoft: '#1F2C45',
  onAccent: '#0B1422',
  brand: '#FF7A2E',
  brandText: '#FF8F4D',
  brandSoft: '#3B2112',
  amber: '#F2B33D',
  amberSoft: '#3A2E14',
  onAmber: '#1E1500',
  danger: '#F07068',
  dangerSoft: '#3B1D1C',
  good: '#45C78C',
  banner: '#0C121B',
  onBanner: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.55)',
  shadow: '#000000',
};

/** Minimum touch size. WCAG asks for 44pt; drivers in gloves need more. */
export const TOUCH = 56;

/** Containers are softer than the controls inside them. */
export const RADIUS = { sheet: 28, card: 22, control: 16, chip: 14, pill: 999 };

/** Geist, loaded in App.tsx. Each weight is its own font family on Android. */
const FAMILY = {
  '400': 'Geist_400Regular',
  '500': 'Geist_500Medium',
  '600': 'Geist_600SemiBold',
  '700': 'Geist_700Bold',
  '800': 'Geist_800ExtraBold',
} as const;

export type Weight = '400' | '500' | '600' | '700' | '800' | '900';

/** Font family for a weight (900 maps to 800, the heaviest we load). */
export function font(weight: Weight = '400'): TextStyle['fontFamily'] {
  return FAMILY[weight === '900' ? '800' : weight];
}

/** Numbers that update live (ETA, miles, range) use tabular figures so they don't jitter. */
export const NUMERIC: TextStyle = { fontVariant: ['tabular-nums'] };

/** Soft, tinted elevation. Level 1 = resting card, 2 = floating control, 3 = sheet. */
export function elevate(t: Theme, level: 1 | 2 | 3): ViewStyle {
  const k = { 1: [2, 6, 0.1, 2], 2: [6, 14, 0.16, 4], 3: [12, 24, 0.22, 8] }[level];
  return { elevation: k[0], shadowColor: t.shadow, shadowRadius: k[1], shadowOpacity: k[2], shadowOffset: { width: 0, height: k[3] } };
}

export const CONGESTION_COLORS = {
  low: '#2F6BDB',
  moderate: '#E39B12',
  heavy: '#E06A1B',
  severe: '#B83A2E',
  unknown: '#2F6BDB',
} as const;
