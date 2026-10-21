// Per-weight imports so only these five font files get bundled, not all eighteen.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { Geist_800ExtraBold } from '@expo-google-fonts/geist/800ExtraBold';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tankEighths } from './core/fuel';
import { MI } from './core/geo';
import { formatCoords } from './core/share';
import { hasToken } from './services/mapbox';
import { load, save } from './services/storage';
import { useOdos } from './state/useOdos';
import { useWeather } from './state/useWeather';
import { ActionTile, BigButton, Icon, IconButton, PressScale, Rail, RoundToggle, ThemeContext, useTheme } from './ui/controls';
import { clockIn, duration, miles } from './ui/format';
import { FuelPanel } from './ui/FuelPanel';
import { ManeuverBanner } from './ui/ManeuverBanner';
import { MapPane } from './ui/MapPane';
import { PanelHandle } from './ui/PanelHandle';
import { DestinationSheet } from './ui/sheets/DestinationSheet';
import { GasSheet } from './ui/sheets/GasSheet';
import { RestSheet, type RestFrom } from './ui/sheets/RestSheet';
import { TripSheet } from './ui/sheets/TripSheet';
import { FuelSheet } from './ui/sheets/FuelSheet';
import { VehicleSheet } from './ui/sheets/VehicleSheet';
import { WeatherSheet } from './ui/sheets/WeatherSheet';
import { WeatherChip } from './ui/WeatherChip';
import { WeatherOverlay } from './ui/WeatherOverlay';
import { DAY, elevate, font, NIGHT, NUMERIC, RADIUS } from './ui/theme';

// Keep the dark logo splash up until saved settings and fonts are loaded, then fade it out.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 300 });

type SheetName = 'dest' | 'vehicle' | 'fuel' | 'fuelAsk' | 'rest' | 'gas' | 'trip' | 'weather' | null;

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  useKeepAwake();
  // Geist + the icon font, bundled with the app. If loading fails we fall back to the system font.
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
    ...MaterialCommunityIcons.font,
  });
  const odos = useOdos();
  const { settings, actions: a } = odos;
  const theme = settings.night ? NIGHT : DAY;
  const ready = odos.loaded && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [follow, setFollow] = useState(true);
  // Minimized: the bottom panel shrinks to one slim bar and the side toggles hide, for more map.
  const [minimized, setMinimizedState] = useState(false);
  useEffect(() => {
    load<boolean>('panelMinimized', false).then(setMinimizedState);
  }, []);
  const setMinimized = useCallback((min: boolean) => {
    setMinimizedState(min);
    save('panelMinimized', min);
  }, []);
  // Measured height of the bottom panel: the re-center button and the driving camera sit above it.
  const [panelH, setPanelH] = useState(260);
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
  // After picking a vehicle, ask how full the tank is instead of assuming full.
  const pickedVehicle = useRef(false);

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

  // The splash screen covers this until ready.
  if (!ready) return <View style={styles.splash} />;

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
            bottomInset={panelH + 24}
            weather={wx.shown}
            weatherFx={wx.fxOn}
          />
        ) : (
          <View style={[styles.center, { backgroundColor: theme.panel, padding: 24 }]}>
            <Text style={{ color: theme.text, fontSize: 20, fontFamily: font('700'), textAlign: 'center' }}>
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
            <PressScale
              accessibilityRole="search"
              accessibilityLabel="Where to? Search for a destination"
              onPress={() => setSheet('dest')}
              scaleTo={0.98}
              style={[styles.searchPill, { backgroundColor: theme.bg }, elevate(theme, 2)]}
            >
              <Icon name="magnify" size={26} color={theme.accent} />
              <Text style={[styles.searchText, { color: theme.muted }]}>{odos.routing ? 'Finding route…' : 'Where to?'}</Text>
            </PressScale>
          )}
          <WeatherChip wx={wx} onPress={() => setSheet('weather')} />
          {odos.permission === 'denied' && !settings.sim ? (
            <BigButton
              icon="map-marker-off"
              label="Location is off. Tap to allow it"
              tone="danger"
              onPress={a.requestLocation}
              style={{ marginTop: 8 }}
            />
          ) : null}
          {odos.pin ? (
            <View style={[styles.pinBar, { backgroundColor: theme.bg }, elevate(theme, 2)]}>
              <Icon name="map-marker" size={22} color={theme.accent} />
              <Text style={[styles.pinText, { color: theme.text }]} numberOfLines={1}>
                {formatCoords(odos.pin, 5)}
              </Text>
              <BigButton
                label="Go"
                tone="accent"
                onPress={() => a.navigateTo({ id: `pin:${odos.pin}`, name: 'Dropped pin', coord: odos.pin!, kind: 'custom' })}
                style={styles.pinBtn}
              />
              <BigButton icon="bed" label="Rest" onPress={() => setSheet('rest')} style={styles.pinBtn} />
              <IconButton icon="close" label="Remove the pin" onPress={() => a.setPin(null)} />
            </View>
          ) : null}
        </View>

        {/* ── side rail of one-tap toggles ── */}
        <View style={[styles.rail, { top: insets.top + (trip ? 210 : 90) }]} pointerEvents="box-none">
          {minimized ? null : (
            <Rail>
              <RoundToggle
                icon={settings.voice ? 'volume-high' : 'volume-off'}
                label="Voice"
                on={settings.voice}
                onPress={() => a.toggle('voice')}
              />
              <RoundToggle icon="weather-night" label="Night" on={settings.night} onPress={() => a.toggle('night')} />
              <RoundToggle icon="traffic-light" label="Traffic" on={settings.traffic} onPress={() => a.toggle('traffic')} />
              <RoundToggle icon="boom-gate" label="No tolls" on={settings.avoidTolls} onPress={a.toggleTolls} />
            </Rail>
          )}
        </View>

        {/* ── bottom panel ── */}
        <View
          onLayout={(e) => setPanelH(Math.round(e.nativeEvent.layout.height))}
          style={[styles.bottom, { backgroundColor: theme.bg, paddingBottom: insets.bottom + 10 }, elevate(theme, 3)]}
        >
          {odos.toast ? <ToastBar key={odos.toast.id} text={odos.toast.text} tone={odos.toast.tone} onDone={a.dismissToast} /> : null}
          <PanelHandle minimized={minimized} onChange={setMinimized} />
          {minimized ? (
            <View style={styles.mini}>
              <Pressable
                onPress={() => setSheet(trip ? 'trip' : 'dest')}
                accessibilityRole="button"
                accessibilityLabel={
                  trip
                    ? `Arrive ${clockIn(remainingS)}, ${miles(remainingMi)} to go. Tap for trip details.`
                    : 'Where to? Search for a destination'
                }
                style={styles.miniTrip}
              >
                {trip ? (
                  <Text style={[styles.miniEta, { color: theme.good }]} numberOfLines={1}>
                    {clockIn(remainingS)}
                    <Text style={[styles.miniMeta, { color: theme.muted }]}> · {miles(remainingMi)}</Text>
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="magnify" size={22} color={theme.accent} />
                    <Text style={[styles.miniMeta, { color: theme.muted, marginLeft: 8 }]}>Where to?</Text>
                  </View>
                )}
              </Pressable>
              {odos.fuelOutlook ? (
                <Pressable
                  onPress={() => setMinimized(false)}
                  accessibilityRole="button"
                  accessibilityLabel={`Fuel range ${miles(odos.fuelOutlook.rangeMi)}${odos.fuelOutlook.inBuffer ? ', fuel stop needed' : ''}. Tap to show the menu.`}
                  style={[styles.miniFuel, { backgroundColor: odos.fuelOutlook.inBuffer ? theme.amber : theme.panel }]}
                >
                  <Icon
                    name={odos.vehicle?.fuel === 'ev' ? 'battery-charging' : 'gas-station'}
                    size={20}
                    color={odos.fuelOutlook.inBuffer ? theme.onAmber : theme.muted}
                  />
                  <Text style={[styles.miniMeta, { color: odos.fuelOutlook.inBuffer ? theme.onAmber : theme.text, marginLeft: 6 }]}>
                    {miles(odos.fuelOutlook.rangeMi)}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {!minimized && trip ? (
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
              <Icon name="chevron-right" size={26} color={theme.muted} />
            </Pressable>
          ) : null}
          {minimized ? null : (
            <>
              <FuelPanel
                vehicle={odos.vehicle}
                outlook={odos.fuelOutlook}
                onFillUp={a.fillUp}
                onPickVehicle={() => setSheet('vehicle')}
                onSetLevel={() => setSheet('fuel')}
              />
              <View style={[styles.actions, { borderTopColor: theme.border }]}>
                <ActionTile
                  icon={trip ? 'map-marker-plus' : 'magnify'}
                  label={trip ? 'Add stop' : 'Where to'}
                  onPress={() => setSheet('dest')}
                />
                <ActionTile
                  icon="gas-station"
                  label="Gas"
                  tone={odos.fuelOutlook?.inBuffer ? 'amber' : 'accent'}
                  onPress={() => setSheet('gas')}
                />
                <ActionTile icon="bed" label="Rest ≤2h" onPress={() => setSheet('rest')} />
                <ActionTile icon="share-variant" label="Share" onPress={a.shareLocation} />
                <ActionTile icon="content-copy" label="Copy" hint="Copies your coordinates" onPress={a.copyCoords} />
              </View>
            </>
          )}
        </View>

        <RecenterButton following={follow} driving={!!trip} bottom={panelH + 12} onPress={() => setFollow(true)} />

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
        {openSheet === 'vehicle' ? (
          <VehicleSheet
            onPick={(v) => {
              a.setVehicle(v);
              pickedVehicle.current = true;
            }}
            onClose={() => {
              if (!pickedVehicle.current) return closeSheet();
              pickedVehicle.current = false;
              setFirstRunDone(true);
              setSheet('fuelAsk');
            }}
          />
        ) : null}
        {(openSheet === 'fuel' || openSheet === 'fuelAsk') && odos.vehicle ? (
          <FuelSheet
            onClose={closeSheet}
            vehicle={odos.vehicle}
            current={odos.fuel ? tankEighths(odos.fuel, odos.vehicle) : 8}
            rangeAt={a.rangeAt}
            onSave={a.setFuelLevel}
            onChangeVehicle={() => setSheet('vehicle')}
            firstTime={openSheet === 'fuelAsk'}
          />
        ) : null}
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
          tolls={odos.route?.tolls ?? null}
          avoidTolls={settings.avoidTolls}
          sim={settings.sim}
          onToggleSim={() => a.toggle('sim')}
          simSpeed={settings.simSpeed}
          onSimSpeed={a.setSimSpeed}
          onRemove={a.removeStop}
          onEnd={a.endTrip}
        />
      </View>
    </ThemeContext.Provider>
  );
}

/**
 * Like Google Maps: a round locate button above the panel, filled in when the map has drifted off
 * your position. While navigating and off-center it becomes a labeled "Re-center" pill.
 */
function RecenterButton({
  following,
  driving,
  bottom,
  onPress,
}: {
  following: boolean;
  driving: boolean;
  bottom: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const pill = driving && !following;
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Map is centered on your location' : 'Re-center map on your location'}
      style={[pill ? styles.recenterPill : styles.recenter, { bottom, backgroundColor: following ? t.bg : t.accent }, elevate(t, 2)]}
    >
      <Icon name={pill ? 'navigation-variant' : 'crosshairs-gps'} size={pill ? 22 : 26} color={following ? t.accent : t.onAccent} />
      {pill ? <Text style={[styles.recenterLabel, { color: t.onAccent }]}>Re-center</Text> : null}
    </PressScale>
  );
}

/** Short confirmations and alerts above the panel. Tap to dismiss. */
function ToastBar({ text, tone, onDone }: { text: string; tone: 'info' | 'amber' | 'good' | 'danger'; onDone: () => void }) {
  const t = useTheme();
  useEffect(() => {
    const id = setTimeout(onDone, tone === 'amber' ? 9000 : 5000);
    return () => clearTimeout(id);
  }, [onDone, tone]);
  const look = {
    info: { bg: t.banner, fg: t.onBanner, icon: 'information-outline' as const },
    amber: { bg: t.amber, fg: t.onAmber, icon: 'alert-outline' as const },
    good: { bg: t.good, fg: '#FFFFFF', icon: 'check-circle-outline' as const },
    danger: { bg: t.danger, fg: '#FFFFFF', icon: 'alert-circle-outline' as const },
  }[tone];
  return (
    <Pressable
      onPress={onDone}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.toast, { backgroundColor: look.bg }]}
    >
      <Icon name={look.icon} size={22} color={look.fg} />
      <Text style={[styles.toastText, { color: look.fg }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splash: { flex: 1, backgroundColor: '#101317' },
  top: { position: 'absolute', left: 12, right: 12 },
  searchPill: { minHeight: 60, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  searchText: { fontSize: 19, fontFamily: font('500'), marginLeft: 12, letterSpacing: -0.2 },
  pinBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.card,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    marginTop: 10,
  },
  pinText: { flex: 1, fontSize: 15, fontFamily: font('500'), marginLeft: 8, ...NUMERIC },
  pinBtn: { minWidth: 64, marginLeft: 6, paddingHorizontal: 12 },
  rail: { position: 'absolute', right: 12 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tripRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, marginBottom: 10 },
  eta: { fontSize: 30, fontFamily: font('700'), marginRight: 12, letterSpacing: -0.8, ...NUMERIC },
  tripMeta: { flex: 1, fontSize: 17, fontFamily: font('500'), ...NUMERIC },
  actions: { flexDirection: 'row', marginTop: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -4 },
  mini: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  miniTrip: { flex: 1, minHeight: 56, justifyContent: 'center' },
  miniEta: { fontSize: 24, fontFamily: font('700'), letterSpacing: -0.5, ...NUMERIC },
  miniMeta: { fontSize: 17, fontFamily: font('600'), ...NUMERIC },
  miniFuel: {
    minHeight: 48,
    minWidth: 96,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenter: { position: 'absolute', right: 14, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  recenterPill: {
    position: 'absolute',
    right: 14,
    minHeight: 56,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterLabel: { fontSize: 17, fontFamily: font('600'), marginLeft: 8 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.control,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  toastText: { flex: 1, fontSize: 16, fontFamily: font('600'), marginLeft: 10, lineHeight: 21 },
});
