import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TRAIL } from '../../config';
import { haversine, MI, type LngLat } from '../../core/geo';
import type { TrailMode, TrailPoi } from '../../core/trails';
import type { TrailState } from '../../state/useTrail';
import { BigButton, Chip, Icon, type IconName, PressScale, ResultRow, Sheet, useTheme } from '../controls';
import { distance } from '../format';
import { font, RADIUS } from '../theme';

const POI_ICON: Record<string, IconName> = {
  trailhead: 'sign-direction',
  peak: 'image-filter-hdr',
  viewpoint: 'binoculars',
  camp_site: 'tent',
  spring: 'water',
  drinking_water: 'water',
  waterfall: 'waves',
  parking: 'parking',
  shelter: 'home-roof',
  alpine_hut: 'home-roof',
  wilderness_hut: 'home-roof',
};

const MODES: { mode: TrailMode; label: string; sub: string; icon: IconName }[] = [
  { mode: 'hike', label: 'On foot / bike', sub: 'Trails and paths', icon: 'hiking' },
  { mode: 'offroad', label: 'Off-road', sub: 'Tracks and back roads', icon: 'jeepney' },
];

/** Trail Mode: pick on foot or off-road, download areas for offline, start/stop, back to start. */
export function TrailSheet({ onClose, trail, here }: { onClose: () => void; trail: TrailState; here: LngLat | null }) {
  const t = useTheme();
  const [radius, setRadius] = useState<number>(TRAIL.radiusMiles[1]);
  const dl = trail.download;
  const busy = dl != null && dl.stage !== 'done';
  const places: TrailPoi[] = trail.area
    ? [...trail.area.pois].sort((a, b) => (here ? haversine(here, a.coord) - haversine(here, b.coord) : 0)).slice(0, 12)
    : [];

  return (
    <Sheet visible title="Trail Mode" onClose={onClose}>
      <View style={styles.modes}>
        {MODES.map((m) => {
          const on = trail.mode === m.mode;
          return (
            <PressScale
              key={m.mode}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${m.label}: ${m.sub}`}
              onPress={() => trail.setMode(m.mode)}
              style={[styles.mode, { backgroundColor: on ? t.brandSoft : t.panel, borderColor: on ? t.brand : 'transparent' }]}
            >
              <Icon name={m.icon} size={30} color={on ? t.brandText : t.muted} />
              <Text style={[styles.modeLabel, { color: on ? t.brandText : t.text }]}>{m.label}</Text>
              <Text style={[styles.modeSub, { color: t.muted }]}>{m.sub}</Text>
            </PressScale>
          );
        })}
      </View>

      {trail.active ? (
        <>
          <Text style={[styles.status, { color: t.text }]}>
            <Text style={{ color: t.brandText, fontFamily: font('700') }}>On</Text> · {trail.area?.name} · {(trail.track.meters / MI).toFixed(1)} mi tracked
          </Text>
          <Text style={[styles.note, { color: t.muted }]}>
            Works with no signal. Hold the map anywhere to drop a pin, then Go to follow the trails there.
          </Text>
          <BigButton icon="home-import-outline" label="Back to start" tone="accent" onPress={() => { trail.backToStart(); onClose(); }} disabled={trail.track.coords.length < 2} />
          {places.length ? (
            <>
              <Text style={[styles.heading, { color: t.muted }]}>PLACES IN THIS AREA</Text>
              {places.map((p) => (
                <ResultRow
                  key={`${p.kind}:${p.coord.join(',')}`}
                  title={p.name}
                  subtitle={here ? `${distance(haversine(here, p.coord))} away` : undefined}
                  icon={POI_ICON[p.kind] ?? 'map-marker-outline'}
                  action="Go"
                  onAction={() => {
                    trail.goTo(p);
                    onClose();
                  }}
                />
              ))}
            </>
          ) : null}
          <BigButton icon="stop-circle-outline" label="End Trail Mode" tone="danger" onPress={() => { trail.stop(); onClose(); }} style={{ marginTop: 12 }} />
        </>
      ) : (
        <>
          {trail.here ? (
            <BigButton icon="map-marker-path" label={`Start in ${trail.here.name}`} tone="accent" onPress={() => { trail.start(trail.here!); onClose(); }} />
          ) : (
            <Text style={[styles.note, { color: t.muted }]}>
              Download the trails around you while you still have signal. Trail Mode then works with none: the map, trail
              directions, your track and Back to start.
            </Text>
          )}

          <Text style={[styles.heading, { color: t.muted }]}>SAVE FOR OFFLINE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {TRAIL.radiusMiles.map((r) => (
              <Chip key={r} label={`${r} mi around me`} on={radius === r} onPress={() => setRadius(r)} />
            ))}
          </View>
          <BigButton
            icon="download-outline"
            label={busy ? (dl!.stage === 'trails' ? 'Downloading trails…' : `Saving topo map… ${Math.round(dl!.percent)}%`) : 'Download this area'}
            tone="soft"
            disabled={busy}
            onPress={() => trail.downloadHere(radius)}
            style={{ marginTop: 6 }}
          />
          {busy && dl!.stage === 'map' ? (
            <Text style={[styles.note, { color: t.muted, marginTop: 6 }]}>Trails are ready to use. The map keeps saving in the background.</Text>
          ) : null}
          {trail.downloadError ? (
            <Text style={[styles.note, { color: t.danger, marginTop: 6 }]}>Couldn’t download: {trail.downloadError}</Text>
          ) : null}

          {trail.areas.length ? (
            <>
              <Text style={[styles.heading, { color: t.muted }]}>SAVED AREAS</Text>
              {trail.areas.map((a) => (
                <View key={a.id}>
                  <ResultRow
                    title={a.name}
                    subtitle={`${(a.radiusM / MI).toFixed(0)} mi · ${a.trails} trails · ${a.places} places · ${(a.bytes / 1e6).toFixed(1)} MB`}
                    icon="terrain"
                    action={trail.here?.id === a.id ? 'Start' : 'Delete'}
                    tone={trail.here?.id === a.id ? 'accent' : 'plain'}
                    onAction={() => {
                      if (trail.here?.id !== a.id) return trail.remove(a.id);
                      trail.start(a);
                      onClose();
                    }}
                  />
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
      <Text style={[styles.fine, { color: t.muted }]}>
        Trail data © OpenStreetMap contributors. Trails can be closed, washed out or wrong on the map: check signs and
        conditions, and carry a paper map where it matters.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  mode: { flex: 1, minHeight: 96, borderRadius: RADIUS.card, borderWidth: 2, alignItems: 'center', justifyContent: 'center', padding: 8 },
  modeLabel: { fontSize: 15, fontFamily: font('700'), marginTop: 4, textAlign: 'center' },
  modeSub: { fontSize: 12, fontFamily: font('500'), textAlign: 'center' },
  status: { fontSize: 17, fontFamily: font('600'), marginBottom: 4 },
  note: { fontSize: 15, fontFamily: font('500'), marginBottom: 10 },
  heading: { fontSize: 15, fontFamily: font('700'), marginTop: 14, marginBottom: 4 },
  fine: { fontSize: 12, fontFamily: font('400'), marginTop: 16 },
});
