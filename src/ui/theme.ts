// High-contrast palette and big touch targets: ODOS is used at a glance, often one-handed.

export type Theme = typeof DAY;

export const DAY = {
  bg: '#FFFFFF',
  panel: '#F4F6F8',
  text: '#0B1220',
  muted: '#4A5568',
  border: '#D0D7DE',
  accent: '#0A6CFF',
  onAccent: '#FFFFFF',
  amber: '#F5A300',
  onAmber: '#1A1200',
  danger: '#D92D20',
  good: '#12A150',
  banner: '#0B3D2E',
  onBanner: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.35)',
};

export const NIGHT: Theme = {
  bg: '#0E1116',
  panel: '#171B22',
  text: '#F2F4F7',
  muted: '#A0AEC0',
  border: '#2D3440',
  accent: '#4C9AFF',
  onAccent: '#0B1220',
  amber: '#FFB627',
  onAmber: '#1A1200',
  danger: '#FF6B5E',
  good: '#3DDC84',
  banner: '#0F5C43',
  onBanner: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.55)',
};

/** Minimum touch size. WCAG asks for 44pt; drivers in gloves need more. */
export const TOUCH = 56;

export const CONGESTION_COLORS = {
  low: '#2E7DFF',
  moderate: '#F5A300',
  heavy: '#E8590C',
  severe: '#B42318',
  unknown: '#2E7DFF',
} as const;
