import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MI } from './core/geo';
import { formatCoords } from './core/share';
import { hasToken } from './services/mapbox';
import { useOdos } from './state/useOdos';
import { useWeather } from './state/useWeather';
import { BigButton, RoundToggle, ThemeContext } from './ui/controls';
import { clockIn, duration, miles } from './ui/format';
import { FuelPanel } from './ui/FuelPanel';
import { ManeuverBanner } from './ui/ManeuverBanner';
import { MapPane } from './ui/MapPane';
import { DestinationSheet } from './ui/sheets/DestinationSheet';
import { GasSheet } from './ui/sheets/GasSheet';
import { RestSheet, type RestFrom } from './ui/sheets/RestSheet';
import { TripSheet } from './ui/sheets/TripSheet';
import { VehicleSheet } from './ui/sheets/VehicleSheet';
import { WeatherSheet } from './ui/sheets/WeatherSheet';
import { WeatherChip } from './ui/WeatherChip';
import { WeatherOverlay } from './ui/WeatherOverlay';
import { DAY, NIGHT } from './ui/theme';

type SheetName = 'dest' | 'vehicle' | 'rest' | 'gas' | 'trip' | 'weather' | null;

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  useKeepAwake();
  const odos = useOdos();
  const { settings, actions: a } = odos;
  const theme = settings.night ? NIGHT : DAY;
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [follow, setFollow] = useState(true);
  const wx = useWeather({
    fix: odos.fix,
    route: odos.route,
    progress: odos.progress,
    fuelKind: odos.vehicle?.fuel ?? null,
    speak: a.speak,
    notify: a.notify,
  });

  // Rain, snow and cold cut real-world range; feed that into the fuel model.
  const { setEfficiency } = a;
  useEffect(() => {
    setEfficiency(wx.fuelFactor);
  }, [setEfficiency, wx.fuelFactor]);

  // First run: ask for the vehicle so fuel tracking works from the first mile.
  const [firstRunDone, setFirstRunDone] = useState(false);
  const openSheet: SheetName = sheet ?? (odos.loaded && !odos.vehicle && !firstRunDone ? 'vehicle' : null);
  const closeSheet = () => {
    setSheet(null);
    setFirstRunDone(true);
  };

  const restFroms = useMemo<RestFrom[]>(() => {
    const f: RestFrom[] = [];
    if (odos.fix) f.push({ key: 'me', label: '📍 Me', coord: odos.fix.coord });
    if (odos.stops[0]) f.push({ key: 'stop', label: `Next stop: ${odos.stops[0].name}`, coord: odos.stops[0].coord });
    if (odos.destination) f.push({ key: 'dest', label: '🏁 Destination', coord: odos.destination.coord });
    if (odos.pin) f.push({ key: 'pin', label: '📌 Map pin', coord: odos.pin });
    return f;
  }, [odos.fix, odos.stops, odos.destination, odos.pin]);

  const trip = odos.route;
  const p = odos.progress;
  const remainingS = p?.remainingSeconds ?? trip?.duration ?? 0;
  const remainingMi = (p?.remainingMeters ?? trip?.distance ?? 0) / MI;

  if (!odos.loaded) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={settings.night ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {hasToken() ? (
          <MapPane
            night={settings.night}
            traffic={settings.traffic}
            sim={settings.sim}
            follow={follow}
            fix={odos.fix}
            route={odos.route}
            stops={odos.stops}
            destination={odos.destination?.coord ?? null}
            pin={odos.pin}
            onLongPress={(c) => {
              a.setPin(c);
              setFollow(false);
            }}
            onUserPan={() => setFollow(false)}
            weather={wx.shown}
            weatherFx={wx.fxOn}
          />
        ) : (
          <View style={[styles.center, { backgroundColor: theme.panel, padding: 24 }]}>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
              Add your Mapbox public token (pk.…) to the .env file as EXPO_PUBLIC_MAPBOX_TOKEN, then rebuild. See README.
            </Text>
          </View>
        )}

        <WeatherOverlay cond={wx.shown} isDay={wx.isDay && !settings.night} enabled={wx.fxOn} />

        {/* ── top ── */}
        <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
          {trip ? (
            <ManeuverBanner progress={p} lanes={odos.lanes} rerouting={odos.routing} />
          ) : (
            <Pressable
              accessibilityRole="search"
              accessibilityLabel="Where to? Search for a destination"
              onPress={() => setSheet('dest')}
              style={[styles.searchPill, { backgroundColor: theme.bg, borderColor: theme.border }]}
            >
              <Text style={{ fontSize: 22 }}>🔍</Text>
              <Text style={{ color: theme.muted, fontSize: 20, fontWeight: '700', marginLeft: 10 }}>
                {odos.routing ? 'Finding route…' : 'Where to?'}
              </Text>
            </Pressable>
          )}
          <WeatherChip wx={wx} onPress={() => setSheet('weather')} />
          {odos.permission === 'denied' && !settings.sim ? (
            <BigButton
              icon="📍"
              label="Location is off. Tap to allow it"
              tone="danger"
              onPress={a.requestLocation}
              style={{ marginTop: 8 }}
            />
          ) : null}
          {odos.pin ? (
            <View style={[styles.pinBar, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', flex: 1 }}>📌 {formatCoords(odos.pin, 5)}</Text>
              <BigButton
                label="Go"
                tone="accent"
                onPress={() => a.navigateTo({ id: `pin:${odos.pin}`, name: 'Dropped pin', coord: odos.pin!, kind: 'custom' })}
                style={styles.pinBtn}
              />
              <BigButton label="Rest ≤2h" onPress={() => setSheet('rest')} style={styles.pinBtn} />
              <BigButton label="✕" onPress={() => a.setPin(null)} style={styles.pinBtn} />
            </View>
          ) : null}
        </View>

        {/* ── side rail of one-tap toggles ── */}
        <View style={[styles.rail, { top: insets.top + (trip ? 210 : 90) }]} pointerEvents="box-none">
          <RoundToggle icon="🔊" label="Voice" on={settings.voice} onPress={() => a.toggle('voice')} />
          <RoundToggle icon="🌙" label="Night" on={settings.night} onPress={() => a.toggle('night')} />
          <RoundToggle icon="🚦" label="Traffic" on={settings.traffic} onPress={() => a.toggle('traffic')} />
          <RoundToggle icon="🧪" label="Sim" on={settings.sim} onPress={() => a.toggle('sim')} />
          {!follow ? <RoundToggle icon="🎯" label="Center" on={false} onPress={() => setFollow(true)} /> : null}
        </View>

        {/* ── bottom panel ── */}
        <View style={[styles.bottom, { backgroundColor: theme.bg, paddingBottom: insets.bottom + 10, borderColor: theme.border }]}>
          {odos.toast ? <ToastBar key={odos.toast.id} text={odos.toast.text} tone={odos.toast.tone} onDone={a.dismissToast} /> : null}
          {trip ? (
            <Pressable
              onPress={() => setSheet('trip')}
              accessibilityRole="button"
              accessibilityLabel={`Arrive ${clockIn(remainingS)}, ${duration(remainingS)}, ${miles(remainingMi)}. ${odos.stops.length} stops. Tap for trip details.`}
              style={styles.tripRow}
            >
              <Text style={[styles.eta, { color: theme.good }]}>{clockIn(remainingS)}</Text>
              <Text style={[styles.tripMeta, { color: theme.text }]}>
                {duration(remainingS)} · {miles(remainingMi)}
                {odos.stops.length ? ` · ${odos.stops.length} stop${odos.stops.length > 1 ? 's' : ''}` : ''}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 22 }}>⌃</Text>
            </Pressable>
          ) : null}
          <FuelPanel vehicle={odos.vehicle} outlook={odos.fuelOutlook} onFillUp={a.fillUp} onPickVehicle={() => setSheet('vehicle')} />
          <View style={styles.actions}>
            <BigButton icon="🔍" label={trip ? 'Add stop' : 'Where to'} onPress={() => setSheet('dest')} style={styles.action} />
            <BigButton
              icon="⛽"
              label="Gas"
              tone={odos.fuelOutlook?.inBuffer ? 'amber' : 'plain'}
              onPress={() => setSheet('gas')}
              style={styles.action}
            />
            <BigButton icon="🛏" label="Rest ≤2h" onPress={() => setSheet('rest')} style={styles.action} />
            <BigButton icon="📤" label="Share" onPress={a.shareLocation} style={styles.action} />
            <BigButton icon="📋" label="Copy" hint="Copies your coordinates" onPress={a.copyCoords} style={styles.action} />
          </View>
        </View>

        {openSheet === 'dest' ? (
          <DestinationSheet
            onClose={closeSheet}
            search={a.search}
            hasTrip={!!trip}
            onGo={(pl) => {
              setSheet(null);
              setFollow(true);
              a.navigateTo(pl);
            }}
            onAddStop={(pl) => {
              setSheet(null);
              a.addStop(pl);
            }}
          />
        ) : null}
        {openSheet === 'vehicle' ? <VehicleSheet onClose={closeSheet} onPick={a.setVehicle} /> : null}
        {openSheet === 'rest' ? (
          <RestSheet
            onClose={closeSheet}
            froms={restFroms}
            search={a.searchRest}
            onAdd={(o) => {
              setSheet(null);
              a.setPin(null);
              a.addStop(o);
            }}
          />
        ) : null}
        {openSheet === 'gas' ? (
          <GasSheet
            onClose={closeSheet}
            find={a.findGas}
            onAdd={(pl) => {
              setSheet(null);
              a.addStop(pl);
            }}
          />
        ) : null}
        <WeatherSheet visible={openSheet === 'weather'} onClose={closeSheet} wx={wx} />
        <TripSheet
          visible={openSheet === 'trip'}
          onClose={closeSheet}
          destination={odos.destination}
          stops={odos.stops}
          offline={odos.offline}
          sim={settings.sim}
          simSpeed={settings.simSpeed}
          onSimSpeed={a.setSimSpeed}
          onRemove={a.removeStop}
          onEnd={a.endTrip}
        />
      </View>
    </ThemeContext.Provider>
  );
}

function ToastBar({ text, tone, onDone }: { text: string; tone: 'info' | 'amber' | 'good' | 'danger'; onDone: () => void }) {
  const t = tone;
  useEffect(() => {
    const id = setTimeout(onDone, tone === 'amber' ? 9000 : 5000);
    return () => clearTimeout(id);
  }, [onDone, tone]);
  const colors = {
    info: ['#1F2937', '#FFFFFF'],
    amber: ['#F5A300', '#1A1200'],
    good: ['#12A150', '#FFFFFF'],
    danger: ['#D92D20', '#FFFFFF'],
  }[t];
  return (
    <Pressable
      onPress={onDone}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{ backgroundColor: colors[0], borderRadius: 14, padding: 12, marginBottom: 10 }}
    >
      <Text style={{ color: colors[1], fontSize: 17, fontWeight: '800' }}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', left: 12, right: 12 },
  searchPill: {
    minHeight: 64,
    borderRadius: 32,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    elevation: 4,
  },
  pinBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 16, padding: 8, marginTop: 8 },
  pinBtn: { minWidth: 64, minHeight: 56, marginLeft: 6 },
  rail: { position: 'absolute', right: 12 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    elevation: 8,
  },
  tripRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, marginBottom: 8 },
  eta: { fontSize: 28, fontWeight: '900', marginRight: 12 },
  tripMeta: { flex: 1, fontSize: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', marginTop: 10, marginHorizontal: -3 },
  action: { flex: 1, marginHorizontal: 3, paddingHorizontal: 2 },
});
