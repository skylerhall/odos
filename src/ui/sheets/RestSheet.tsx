import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { REST } from '../../config';
import type { LngLat } from '../../core/geo';
import type { RestOption } from '../../core/places';
import type { RestKind } from '../../services/rest';
import { Chip, type IconName, ResultRow, Sheet, useTheme } from '../controls';
import { useAsync } from '../useAsync';
import { duration, miles } from '../format';
import { font } from '../theme';

export type RestFrom = { key: string; label: string; coord: LngLat };

const KINDS: { kind: RestKind; label: string; icon: IconName }[] = [
  { kind: 'hotel', label: 'Hotels', icon: 'bed' },
  { kind: 'camp', label: 'Campgrounds', icon: 'tent' },
  { kind: 'freepark', label: 'Free lots', icon: 'parking' },
];
const KIND_ICON: Record<string, IconName> = { hotel: 'bed', camp: 'tent', freepark: 'parking' };

/** Hotels, campgrounds and free overnight parking within 2 hours of any stopping point. */
export function RestSheet(props: {
  onClose: () => void;
  froms: RestFrom[];
  search: (point: LngLat, kinds: RestKind[]) => Promise<RestOption[]>;
  onAdd: (o: RestOption) => void;
}) {
  const t = useTheme();
  const [fromKey, setFromKey] = useState<string | null>(null);
  const [kinds, setKinds] = useState<RestKind[]>(['hotel', 'camp', 'freepark']);
  // Freeze the starting points when the sheet opens; "Me" would otherwise move every GPS fix
  // and re-run the search each second.
  const [froms] = useState(props.froms);

  const from = froms.find((f) => f.key === fromKey) ?? froms[0];
  const { search } = props;
  const key = from && kinds.length ? `${from.key}|${from.coord.join(',')}|${kinds.join()}` : '';
  const { data: results, loading: busy, error } = useAsync(key && from ? () => search(from.coord, kinds) : null, key);

  const toggleKind = (k: RestKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <Sheet visible title={`Rest within ${REST.maxDriveHours} hrs`} onClose={props.onClose}>
      <Text style={{ color: t.muted, fontSize: 15, fontFamily: font('600'), marginBottom: 4 }}>FROM</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {froms.map((f) => (
          <Chip key={f.key} label={f.label} on={from?.key === f.key} onPress={() => setFromKey(f.key)} />
        ))}
      </View>
      {froms.length === 0 ? (
        <Text style={{ color: t.danger, fontSize: 16, fontFamily: font('400') }}>
          Waiting for GPS. Or long-press the map to drop a pin.
        </Text>
      ) : null}
      <Text style={{ color: t.muted, fontSize: 15, fontFamily: font('600'), marginTop: 6, marginBottom: 4 }}>SHOW</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} icon={k.icon} on={kinds.includes(k.kind)} onPress={() => toggleKind(k.kind)} />
        ))}
      </View>
      {busy ? <ActivityIndicator color={t.accent} style={{ margin: 16 }} /> : null}
      {error ? <Text style={{ color: t.danger, fontSize: 16, fontFamily: font('400') }}>Couldn’t search right now.</Text> : null}
      {results && results.length === 0 ? (
        <Text style={{ color: t.text, fontSize: 17, marginTop: 8, fontFamily: font('400') }}>
          Nothing found within {REST.maxDriveHours} hours of this point.
        </Text>
      ) : null}
      {results?.some((r) => r.estimated) ? (
        <Text style={{ color: t.amber, fontSize: 14, fontFamily: font('600'), marginTop: 6 }}>
          ≈ No signal: drive times are estimates from distance.
        </Text>
      ) : null}
      {results?.map((o) => (
        <ResultRow
          key={o.id}
          title={o.name}
          icon={KIND_ICON[o.kind] ?? 'map-marker-outline'}
          subtitle={o.note ?? o.address}
          detail={`${o.estimated ? '≈ ' : ''}${duration(o.driveSeconds)} · ${miles(o.miles)}`}
          action="+ Add"
          onAction={() => props.onAdd(o)}
        />
      ))}
    </Sheet>
  );
}
