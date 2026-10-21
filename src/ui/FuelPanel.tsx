import { StyleSheet, Text, View } from 'react-native';
import { FUEL } from '../config';
import type { FuelOutlook } from '../core/fuel';
import type { Vehicle } from '../core/vehicles/types';
import { BigButton, Icon, PressScale, useTheme } from './controls';
import { miles } from './format';
import { font, NUMERIC, RADIUS } from './theme';

/** Range, a slim tank gauge, what happens next with fuel, and the one-tap "I just filled up". */
export function FuelPanel(props: {
  vehicle: Vehicle | null;
  outlook: FuelOutlook | null;
  onFillUp: () => void;
  onPickVehicle: () => void;
  /** Tapping the gauge: set the level by hand or change vehicle. */
  onSetLevel: () => void;
}) {
  const t = useTheme();
  const { vehicle, outlook: o } = props;
  if (!vehicle || !o) {
    return (
      <BigButton
        icon="car-side"
        label="Pick your vehicle to track fuel"
        tone="accent"
        onPress={props.onPickVehicle}
        hint="Opens the vehicle list"
      />
    );
  }
  const ev = vehicle.fuel === 'ev';
  const low = o.inBuffer || o.percent < 0.35;
  const gauge = o.inBuffer ? t.amber : low ? t.amber : t.good;
  let status: string;
  if (o.inBuffer) status = `Under ${FUEL.bufferMiles} mi · ${ev ? 'charge' : 'gas'} stop planned`;
  else if (o.arrivalMi != null && o.arrivalMi < FUEL.bufferMiles)
    status = `${ev ? 'Charge' : 'Fuel'} alert in ${miles(o.untilAlertMi)} · stop needed`;
  else if (o.arrivalMi != null) status = `Arrive with ${miles(o.arrivalMi)} left`;
  else status = `${ev ? 'Charge' : 'Fuel'} alert in ${miles(o.untilAlertMi)}`;

  return (
    <View style={styles.wrap}>
      <PressScale
        style={{ flex: 1 }}
        scaleTo={0.98}
        onPress={props.onSetLevel}
        accessibilityRole="button"
        accessibilityLabel={`${vehicle.make} ${vehicle.model}. Range ${miles(o.rangeMi)}. ${status}.`}
        accessibilityHint={`Set the ${ev ? 'battery' : 'fuel'} level or change vehicle`}
      >
        <View style={styles.topLine}>
          <Icon name={ev ? 'battery-charging' : 'gas-station'} size={22} color={o.inBuffer ? t.amber : t.muted} />
          <Text style={[styles.range, { color: o.inBuffer ? t.amber : t.text }]}>{miles(o.rangeMi)}</Text>
          <Text style={[styles.car, { color: t.muted }]} numberOfLines={1}>
            {vehicle.make} {vehicle.model}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: t.panel }]}>
          <View style={[styles.fill, { width: `${Math.max(4, Math.round(o.percent * 100))}%`, backgroundColor: gauge }]} />
        </View>
        <Text style={[styles.status, { color: o.inBuffer ? t.amber : t.muted }]} numberOfLines={1}>
          {status}
        </Text>
      </PressScale>
      <BigButton
        icon={ev ? 'ev-station' : 'gas-station'}
        label={ev ? 'Charged' : 'Filled up'}
        tone={o.inBuffer ? 'amber' : 'soft'}
        stacked
        onPress={props.onFillUp}
        hint="Resets the tank to full and sets your next fuel alert"
        style={styles.fillBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  topLine: { flexDirection: 'row', alignItems: 'center' },
  range: { fontSize: 26, fontFamily: font('700'), marginLeft: 6, letterSpacing: -0.6, ...NUMERIC },
  car: { flex: 1, fontSize: 14, fontFamily: font('500'), marginLeft: 10, marginTop: 4 },
  track: { height: 8, borderRadius: 4, marginTop: 8, marginBottom: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  status: { fontSize: 14, fontFamily: font('500'), ...NUMERIC },
  fillBtn: { width: 104, marginLeft: 14, borderRadius: RADIUS.card },
});
