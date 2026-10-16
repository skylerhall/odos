import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FUEL } from '../config';
import type { FuelOutlook } from '../core/fuel';
import type { Vehicle } from '../core/vehicles/types';
import { BigButton, useTheme } from './controls';
import { miles } from './format';

/** Range bar, what happens next with fuel, and the one-tap "I just filled up". */
export function FuelPanel(props: { vehicle: Vehicle | null; outlook: FuelOutlook | null; onFillUp: () => void; onPickVehicle: () => void }) {
  const t = useTheme();
  const { vehicle, outlook: o } = props;
  if (!vehicle || !o) {
    return (
      <BigButton icon="🚗" label="Pick your vehicle to track fuel" tone="accent" onPress={props.onPickVehicle} hint="Opens the vehicle list" />
    );
  }
  const ev = vehicle.fuel === 'ev';
  const barColor = o.inBuffer ? t.amber : o.percent < 0.35 ? t.amber : t.good;
  let status: string;
  if (o.inBuffer) status = `Under ${FUEL.bufferMiles} mi — ${ev ? 'charge' : 'gas'} stop planned`;
  else if (o.arrivalMi != null && o.arrivalMi < FUEL.bufferMiles) status = `${ev ? 'Charge' : 'Fuel'} alert in ${miles(o.untilAlertMi)} · stop needed this trip`;
  else if (o.arrivalMi != null) status = `Arrive with ${miles(o.arrivalMi)} of range`;
  else status = `${ev ? 'Charge' : 'Fuel'} alert in ${miles(o.untilAlertMi)}`;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={{ flex: 1 }}
        onPress={props.onPickVehicle}
        accessibilityRole="button"
        accessibilityLabel={`${vehicle.make} ${vehicle.model}. Range ${miles(o.rangeMi)}. ${status}. Tap to change vehicle.`}
      >
        <Text style={[styles.range, { color: o.inBuffer ? t.amber : t.text }]}>
          {ev ? '🔋' : '⛽'} {miles(o.rangeMi)}
          <Text style={[styles.car, { color: t.muted }]}>  {vehicle.make} {vehicle.model}</Text>
        </Text>
        <View style={[styles.bar, { backgroundColor: t.panel, borderColor: t.border }]}>
          <View style={{ width: `${Math.round(o.percent * 100)}%`, backgroundColor: barColor, borderRadius: 6, height: '100%' }} />
        </View>
        <Text style={[styles.status, { color: o.inBuffer ? t.amber : t.muted }]} numberOfLines={1}>
          {status}
        </Text>
      </Pressable>
      <BigButton
        icon={ev ? '🔌' : '⛽'}
        label={ev ? 'Just charged' : 'I just filled up'}
        tone={o.inBuffer ? 'amber' : 'plain'}
        onPress={props.onFillUp}
        hint="Resets the tank to full and sets your next fuel alert"
        style={{ width: 118, marginLeft: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  range: { fontSize: 26, fontWeight: '900' },
  car: { fontSize: 14, fontWeight: '600' },
  bar: { height: 14, borderRadius: 7, borderWidth: 1, marginVertical: 6, flexDirection: 'row', overflow: 'hidden' },
  status: { fontSize: 15, fontWeight: '700' },
});
