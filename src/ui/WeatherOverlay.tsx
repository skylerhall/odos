// Ambient sky effects drawn over the map: sun glow, drifting clouds, fog banks, lightning.
// Rain and snow are drawn by Mapbox itself inside the map (see WeatherMapLayers below), so they sit
// in the 3D scene and tilt with the camera. Everything here ignores touches and stays subtle so the
// route stays readable.

import Mapbox from '@rnmapbox/maps';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Condition } from '../core/weather';

const TINT: Record<string, string> = {
  clearDay: 'rgba(255, 196, 64, 0.06)',
  clearNight: 'rgba(40, 60, 120, 0.06)',
  partly: 'rgba(120, 130, 150, 0.05)',
  cloudy: 'rgba(110, 120, 135, 0.13)',
  fog: 'rgba(225, 230, 235, 0.22)',
  drizzle: 'rgba(90, 110, 140, 0.08)',
  rain: 'rgba(70, 90, 125, 0.12)',
  heavyRain: 'rgba(50, 65, 95, 0.18)',
  freezing: 'rgba(160, 205, 235, 0.14)',
  snow: 'rgba(235, 242, 250, 0.10)',
  heavySnow: 'rgba(240, 245, 252, 0.18)',
  storm: 'rgba(30, 35, 55, 0.22)',
};

export function WeatherOverlay({ cond, isDay, enabled }: { cond: Condition | null; isDay: boolean; enabled: boolean }) {
  if (!cond || !enabled) return null;
  const s = cond.sky;
  const tint = s === 'clear' ? (isDay ? TINT.clearDay : TINT.clearNight) : TINT[s];
  const clouds = s === 'partly' ? 2 : s === 'cloudy' ? 4 : s === 'storm' || s === 'heavyRain' ? 4 : s === 'rain' || s === 'drizzle' ? 3 : 0;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      {s === 'clear' && isDay ? <Sun /> : null}
      {s === 'partly' && isDay ? <Sun small /> : null}
      {clouds > 0 ? <Clouds count={clouds} dark={s === 'storm' || s === 'heavyRain'} /> : null}
      {s === 'fog' ? <Fog /> : null}
      {s === 'storm' ? <Lightning /> : null}
    </View>
  );
}

function loop(value: Animated.Value, duration: number, opts: { reverse?: boolean; delay?: number } = {}) {
  const anim = opts.reverse
    ? Animated.sequence([
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    : Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true });
  const l = Animated.loop(opts.delay ? Animated.sequence([Animated.delay(opts.delay), anim]) : anim);
  l.start();
  return l;
}

/** Warm glow in the top-right corner with slowly turning rays. */
function Sun({ small }: { small?: boolean }) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = loop(pulse, 3500, { reverse: true });
    const b = loop(spin, 60000);
    return () => {
      a.stop();
      b.stop();
    };
  }, [pulse, spin]);
  const size = small ? 220 : 320;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ position: 'absolute', top: -size / 2, right: -size / 2, width: size, height: size, transform: [{ scale }] }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        {Array.from({ length: 12 }, (_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: size / 2 - 3,
              top: 0,
              width: 6,
              height: size,
              borderRadius: 3,
              backgroundColor: 'rgba(255, 200, 70, 0.10)',
              transform: [{ rotate: `${i * 15}deg` }],
            }}
          />
        ))}
      </Animated.View>
      {[1, 0.72, 0.46].map((k, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (size * (1 - k)) / 2,
            top: (size * (1 - k)) / 2,
            width: size * k,
            height: size * k,
            borderRadius: (size * k) / 2,
            backgroundColor: ['rgba(255, 210, 90, 0.10)', 'rgba(255, 195, 60, 0.16)', 'rgba(255, 180, 40, 0.28)'][i],
          }}
        />
      ))}
    </Animated.View>
  );
}

/** Soft clouds drifting across the top of the map at different speeds and heights. */
function Clouds({ count, dark }: { count: number; dark: boolean }) {
  const { width, height } = useWindowDimensions();
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Cloud key={i} index={i} screenW={width} top={height * (0.08 + 0.09 * i)} dark={dark} />
      ))}
    </>
  );
}

function Cloud({ index, screenW, top, dark }: { index: number; screenW: number; top: number; dark: boolean }) {
  // Start each cloud partway across so the sky isn't empty at first.
  const [x] = useState(() => new Animated.Value((index * 0.37) % 1));
  const w = 180 + (index % 3) * 50;
  useEffect(() => {
    const drift = () =>
      Animated.timing(x, { toValue: 1, duration: 70000 + index * 18000, easing: Easing.linear, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) {
            x.setValue(0);
            drift();
          }
        },
      );
    drift();
    return () => x.stopAnimation();
  }, [x, index]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-w, screenW + w] });
  const color = dark ? 'rgba(70, 76, 92, 0.42)' : 'rgba(255, 255, 255, 0.55)';
  const puffs = [
    { l: 0, t: w * 0.18, d: w * 0.42 },
    { l: w * 0.22, t: 0, d: w * 0.55 },
    { l: w * 0.5, t: w * 0.1, d: w * 0.46 },
    { l: w * 0.12, t: w * 0.24, d: w * 0.7, h: w * 0.28 },
  ];
  return (
    <Animated.View style={{ position: 'absolute', top, left: 0, width: w, height: w * 0.55, transform: [{ translateX }] }}>
      {puffs.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.l,
            top: p.t,
            width: p.d,
            height: p.h ?? p.d,
            borderRadius: p.d / 2,
            backgroundColor: color,
          }}
        />
      ))}
    </Animated.View>
  );
}

/** Slow-breathing fog banks. */
function Fog() {
  const { height } = useWindowDimensions();
  const [vals] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    const loops = vals.map((v, i) => loop(v, 5000 + i * 1700, { reverse: true, delay: i * 900 }));
    return () => loops.forEach((l) => l.stop());
  }, [vals]);
  return (
    <>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: -60,
            right: -60,
            top: height * (0.2 + i * 0.22),
            height: height * 0.2,
            borderRadius: 200,
            backgroundColor: 'rgba(235, 238, 242, 0.5)',
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
            transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-30, 30] }) }],
          }}
        />
      ))}
    </>
  );
}

/** A double flash every 7–15 seconds. Short and dim enough not to dazzle. */
function Lightning() {
  const [flash] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const strike = () => {
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.35, duration: 60, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0.25, duration: 50, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
      timer = setTimeout(strike, 7000 + Math.random() * 8000);
    };
    timer = setTimeout(strike, 2500);
    return () => clearTimeout(timer);
  }, [flash]);
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: flash }]} />;
}

/** Rain and snow, rendered by Mapbox inside the map. Place as a child of MapView. */
export function WeatherMapLayers({ cond, enabled, night }: { cond: Condition | null; enabled: boolean; night: boolean }) {
  if (!cond || !enabled) return null;
  const k = cond.intensity;
  // Explicit colors: the defaults only work on Mapbox Standard styles, and we use Streets/Dark.
  const vignetteColor = night ? '#1B2230' : '#5A6270';
  switch (cond.sky) {
    case 'drizzle':
    case 'rain':
    case 'heavyRain':
    case 'storm':
    case 'freezing':
      return (
        <Mapbox.Rain
          style={{
            density: 0.25 + 0.65 * k,
            intensity: 0.4 + 0.6 * k,
            color: cond.sky === 'freezing' ? '#CFE6F7' : night ? '#8C95A8' : '#A8ADBC',
            opacity: 0.55 + 0.35 * k,
            vignette: 0.3 + 0.5 * k,
            vignetteColor,
            dropletSize: cond.sky === 'drizzle' ? [1.6, 10] : [2.6, 18],
            direction: cond.sky === 'storm' ? [20, 30] : [0, 80],
            centerThinning: 0.6,
          }}
        />
      );
    case 'snow':
    case 'heavySnow':
      return (
        <Mapbox.Snow
          style={{
            density: 0.3 + 0.6 * k,
            intensity: 0.5 + 0.5 * k,
            color: '#FFFFFF',
            opacity: 0.9,
            vignette: 0.25 + 0.35 * k,
            vignetteColor: night ? '#2A3240' : '#DDE3EA',
            flakeSize: cond.sky === 'heavySnow' ? 0.9 : 0.6,
            centerThinning: 0.4,
          }}
        />
      );
    default:
      return null;
  }
}
