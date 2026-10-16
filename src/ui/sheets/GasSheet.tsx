import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { FUEL } from '../../config';
import type { GasPick, Place } from '../../core/places';
import type { GasPlan } from '../../services/gas';
import { ResultRow, Sheet, useTheme } from '../controls';

/** Gas along the route, best first. Window matches (15–30 mi ahead, on the route) are flagged. */
export function GasSheet(props: { visible: boolean; onClose: () => void; find: () => Promise<GasPlan | null>; onAdd: (p: Place) => void }) {
  const t = useTheme();
  const [plan, setPlan] = useState<GasPlan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.visible) return;
    let live = true;
    setBusy(true);
    props
      .find()
      .then((p) => live && setPlan(p))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [props.visible]);

  const label = (g: GasPick) =>
    `${Math.round(g.aheadMi)} mi ahead${g.detourMi > 0.2 ? ` · ${g.detourMi.toFixed(1)} mi off route` : ' · on route'}${g.inWindow ? ` · ✓ in ${FUEL.stopMinMiles}–${FUEL.stopMaxMiles} mi window` : ''}`;

  return (
    <Sheet visible={props.visible} title="Gas" onClose={props.onClose}>
      {busy ? <ActivityIndicator color={t.accent} style={{ margin: 16 }} /> : null}
      {plan?.offline ? <Text style={{ color: t.amber, fontSize: 15, fontWeight: '700' }}>No signal: showing stations saved for this trip.</Text> : null}
      {!busy && plan && plan.options.length === 0 ? <Text style={{ color: t.text, fontSize: 17 }}>No stations found ahead within your range.</Text> : null}
      {!busy && !plan ? <Text style={{ color: t.text, fontSize: 17 }}>Waiting for GPS…</Text> : null}
      {plan?.options.map((g) => (
        <ResultRow
          key={g.place.id}
          title={`⛽ ${g.place.name}`}
          subtitle={g.place.address}
          detail={label(g)}
          action="+ Add"
          tone={g.inWindow ? 'amber' : 'accent'}
          onAction={() => props.onAdd(g.place)}
        />
      ))}
    </Sheet>
  );
}
