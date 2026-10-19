import { Text, View } from 'react-native';
import { MI } from '../../core/geo';
import { weatherIcon, type Sky } from '../../core/weather';
import type { WeatherState } from '../../state/useWeather';
import { BigButton, Chip, ResultRow, Sheet, useTheme } from '../controls';
import { clockIn } from '../format';

const PREVIEWS: { sky: Sky; label: string }[] = [
  { sky: 'clear', label: '☀️ Sun' },
  { sky: 'partly', label: '⛅ Partly' },
  { sky: 'cloudy', label: '☁️ Cloudy' },
  { sky: 'rain', label: '🌧️ Rain' },
  { sky: 'heavyRain', label: '🌧️ Downpour' },
  { sky: 'snow', label: '🌨️ Snow' },
  { sky: 'heavySnow', label: '❄️ Blizzard' },
  { sky: 'storm', label: '⛈️ Storm' },
  { sky: 'fog', label: '🌫️ Fog' },
];

/** Weather now, along the route, official alerts, and the effects controls. */
export function WeatherSheet({ visible, onClose, wx }: { visible: boolean; onClose: () => void; wx: WeatherState }) {
  const t = useTheme();
  const c = wx.current;
  const fuelHit = Math.round((1 - wx.fuelFactor) * 100);
  return (
    <Sheet visible={visible} title="Weather" onClose={onClose}>
      {c ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }} accessible accessibilityLabel={`Now: ${c.cond.label}, ${Math.round(c.tempF ?? 0)} degrees, wind ${Math.round(c.windMph ?? 0)} miles per hour`}>
          <Text style={{ fontSize: 56 }}>{weatherIcon(c.cond.sky, c.isDay)}</Text>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 34, fontWeight: '900' }}>{c.tempF != null ? `${Math.round(c.tempF)}°F` : '—'}</Text>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>
              {c.cond.label}
              {c.windMph != null ? ` · wind ${Math.round(c.windMph)} mph` : ''}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={{ color: t.muted, fontSize: 17, marginBottom: 8 }}>Waiting for GPS and a connection…</Text>
      )}

      {wx.tip ? (
        <Text style={{ color: t.onAmber, backgroundColor: t.amber, fontSize: 17, fontWeight: '800', padding: 12, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
          {wx.tip}
        </Text>
      ) : null}
      {fuelHit > 0 ? (
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
          ⛽ Range estimate lowered {fuelHit}% for {c?.cond.label.toLowerCase()}
          {c?.tempF != null && c.tempF < 50 ? ' and cold' : ''}.
        </Text>
      ) : null}

      {wx.alerts.map((a) => (
        <View key={a.id} style={{ borderLeftWidth: 6, borderLeftColor: a.severity === 'Moderate' ? t.amber : t.danger, paddingLeft: 10, marginVertical: 6 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '900' }}>⚠️ {a.event}</Text>
          <Text style={{ color: t.muted, fontSize: 15 }}>{a.headline}</Text>
        </View>
      ))}

      {wx.ahead.length ? (
        <>
          <Text style={{ color: t.muted, fontSize: 15, fontWeight: '800', marginTop: 10 }}>ALONG YOUR ROUTE</Text>
          {wx.ahead.map((r) => (
            <View
              key={r.aheadMeters}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderColor: t.border }}
              accessible
              accessibilityLabel={`In ${Math.round(r.aheadMeters / MI)} miles, around ${clockIn(r.etaSeconds)}: ${r.cond.label}, ${Math.round(r.tempF ?? 0)} degrees`}
            >
              <Text style={{ fontSize: 28, width: 44 }}>{weatherIcon(r.cond.sky, true)}</Text>
              <Text style={{ color: r.cond.hazard ? t.amber : t.text, fontSize: 17, fontWeight: '800', flex: 1 }}>{r.cond.label}</Text>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
                {Math.round(r.aheadMeters / MI)} mi · {clockIn(r.etaSeconds)} · {r.tempF != null ? `${Math.round(r.tempF)}°` : ''}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      <Text style={{ color: t.muted, fontSize: 15, fontWeight: '800', marginTop: 14, marginBottom: 6 }}>MAP EFFECTS</Text>
      <BigButton
        icon={wx.fx ? '✨' : '⭘'}
        label={wx.fx ? 'Weather effects on' : 'Weather effects off'}
        tone={wx.fx ? 'accent' : 'plain'}
        onPress={wx.toggleFx}
        hint="Shows rain, snow, clouds, fog and sun on the map"
      />
      {wx.reduceMotion ? (
        <Text style={{ color: t.muted, fontSize: 15, marginTop: 6 }}>Your phone’s Reduce Motion setting is on, so animated effects are paused.</Text>
      ) : null}

      <Text style={{ color: t.muted, fontSize: 15, fontWeight: '800', marginTop: 14, marginBottom: 6 }}>PREVIEW AN EFFECT</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label="📡 Live" on={!wx.previewing} onPress={() => wx.setPreview(null)} />
        {PREVIEWS.map((p) => (
          <Chip key={p.sky} label={p.label} on={wx.previewing === p.sky} onPress={() => wx.setPreview(p.sky)} />
        ))}
      </View>
      <ResultRow title="" subtitle="Weather from Open-Meteo · alerts from the National Weather Service" action="Refresh" tone="plain" onAction={wx.refresh} />
    </Sheet>
  );
}
