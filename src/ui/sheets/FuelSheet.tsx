import { useState } from 'react';
import { Text, View } from 'react-native';
import { gaugeLabel } from '../../core/fuel';
import type { Vehicle } from '../../core/vehicles/types';
import { BigButton, Sheet, useTheme } from '../controls';
import { FuelLevelSlider } from '../FuelLevelSlider';
import { miles } from '../format';
import { font, NUMERIC } from '../theme';

/** Set the tank level by hand (starting on a partial tank, or the estimate drifted), or change vehicle. */
export function FuelSheet(props: {
  onClose: () => void;
  vehicle: Vehicle;
  /** Current level in eighths. */
  current: number;
  rangeAt: (eighths: number) => number;
  onSave: (eighths: number) => void;
  onChangeVehicle: () => void;
  /** Just picked a vehicle: ask how full the tank is. */
  firstTime?: boolean;
}) {
  const t = useTheme();
  const [value, setValue] = useState(props.current);
  const ev = props.vehicle.fuel === 'ev';
  const range = props.rangeAt(value);

  return (
    <Sheet visible title={props.firstTime ? (ev ? 'How charged is it?' : 'How full is your tank?') : ev ? 'Battery level' : 'Fuel level'} onClose={props.onClose}>
      <Text style={{ color: t.muted, fontSize: 15, fontFamily: font('500') }}>
        {props.vehicle.make} {props.vehicle.model}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6, marginBottom: 8 }} accessible={false}>
        <Text style={{ color: t.text, fontSize: 40, fontFamily: font('800'), letterSpacing: -1, ...NUMERIC }}>
          {gaugeLabel(value, ev)}
        </Text>
        <Text style={{ color: t.muted, fontSize: 18, fontFamily: font('600'), marginLeft: 8 }}>{ev ? 'charged' : 'tank'}</Text>
        <Text style={{ color: value <= 2 ? t.amber : t.text, fontSize: 18, fontFamily: font('700'), marginLeft: 'auto', ...NUMERIC }}>
          ≈ {miles(range)}
        </Text>
      </View>
      <FuelLevelSlider value={value} onChange={setValue} ev={ev} />
      <BigButton
        icon="check"
        label={`Set to ${gaugeLabel(value, ev)}`}
        tone="accent"
        onPress={() => {
          props.onSave(value);
          props.onClose();
        }}
        style={{ marginTop: 14 }}
      />
      <BigButton icon="car-side" label="Change vehicle" tone="soft" onPress={props.onChangeVehicle} style={{ marginTop: 10 }} />
    </Sheet>
  );
}
