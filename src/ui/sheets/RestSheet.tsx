import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { REST } from '../../config';
import type { LngLat } from '../../core/geo';
import type { RestOption } from '../../core/places';
import type { RestKind } from '../../services/rest';
import { Chip, ResultRow, Sheet, useTheme } from '../controls';
import { duration, miles } from '../format';

export type RestFrom = { key: string; label: string; coord: LngLat };

const KINDS: { kind: RestKind; label: string; icon: string }[] = [
  { kind: 'hotel', label: 'Hotels', icon: '🏨' },
  { kind: 'camp', label: 'Campgrounds', icon: '🏕' },
  { kind: 'freepark', label: 'Free lots', icon: '🅿' },
];

/** Hotels, campgrounds and free overnight parking within 2 hours of any stopping point. */
export function RestSheet(props: {
  visible: boolean;
  onClose: () => void;
  froms: RestFrom[];
  search: (point: LngLat, kinds: RestKind[]) => Promise<RestOption[]>;
  onAdd: (o: RestOption) => void;
}) {
  const t = useTheme();
  const [fromKey, setFromKey] = useState<string | null>(null);
  const [kinds, setKinds] = useState<RestKind[]>(['hotel', 'camp', 'freepark']);
  const [results, setResults] = useState<RestOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = props.froms.find((f) => f.key === fromKey) ?? props.froms[0];

  useEffect(() => {
    if (!props.visible || !from || kinds.length === 0) return;
    let live = true;
    setBusy(true);
    setError(null);
    setResults(null);
    props
      .search(from.coord, kinds)
      .then((r) => live && setResults(r))
      .catch(() => live && setError('Couldn’t search right now.'))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
    // Re-run when the chosen point or kinds change (coords compared by value).
  }, [props.visible, from?.key, from?.coord[0], from?.coord[1], kinds.join()]);

  const toggleKind = (k: RestKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const icon = (o: RestOption) => KINDS.find((k) => k.kind === o.kind)?.icon ?? '📍';

  return (
    <Sheet visible={props.visible} title={`Rest within ${REST.maxDriveHours} hrs`} onClose={props.onClose}>
      <Text style={{ color: t.muted, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>FROM</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {props.froms.map((f) => (
          <Chip key={f.key} label={f.label} on={from?.key === f.key} onPress={() => setFromKey(f.key)} />
        ))}
      </View>
      {props.froms.length === 0 ? <Text style={{ color: t.danger, fontSize: 16 }}>Waiting for GPS. Or long-press the map to drop a pin.</Text> : null}
      <Text style={{ color: t.muted, fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 4 }}>SHOW</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={`${k.icon} ${k.label}`} on={kinds.includes(k.kind)} onPress={() => toggleKind(k.kind)} />
        ))}
      </View>
      {busy ? <ActivityIndicator color={t.accent} style={{ margin: 16 }} /> : null}
      {error ? <Text style={{ color: t.danger, fontSize: 16 }}>{error}</Text> : null}
      {results && results.length === 0 ? <Text style={{ color: t.text, fontSize: 17, marginTop: 8 }}>Nothing found within {REST.maxDriveHours} hours of this point.</Text> : null}
      {results?.some((r) => r.estimated) ? (
        <Text style={{ color: t.amber, fontSize: 14, fontWeight: '700', marginTop: 6 }}>≈ No signal: drive times are estimates from distance.</Text>
      ) : null}
      {results?.map((o) => (
        <ResultRow
          key={o.id}
          title={`${icon(o)} ${o.name}`}
          subtitle={o.note ?? o.address}
          detail={`${o.estimated ? '≈ ' : ''}${duration(o.driveSeconds)} · ${miles(o.miles)}`}
          action="+ Add"
          onAction={() => props.onAdd(o)}
        />
      ))}
    </Sheet>
  );
}
