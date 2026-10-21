import { Text, View } from 'react-native';
import type { Place, Stop } from '../../core/places';
import type { OfflineStatus } from '../../services/offline';
import { BigButton, Chip, ResultRow, Sheet, useTheme } from '../controls';
import { font } from '../theme';

/** Trip overview: stops (remove any), offline status, Sim speed, end trip. */
export function TripSheet(props: {
  visible: boolean;
  onClose: () => void;
  destination: Place | null;
  stops: Stop[];
  offline: OfflineStatus;
  sim: boolean;
  simSpeed: number;
  onSimSpeed: (n: number) => void;
  onRemove: (id: string) => void;
  onEnd: () => void;
}) {
  const t = useTheme();
  const off = props.offline;
  return (
    <Sheet visible={props.visible} title="Trip" onClose={props.onClose}>
      {props.destination ? (
        <Text style={{ color: t.text, fontSize: 20, fontFamily: font('700'), marginBottom: 6 }}>{props.destination.name}</Text>
      ) : (
        <Text style={{ color: t.muted, fontSize: 17, fontFamily: font('400') }}>No trip yet.</Text>
      )}
      {props.stops.map((s, i) => (
        <ResultRow
          key={s.id}
          title={`${i + 1}. ${s.name}`}
          icon={
            s.kind === 'gas'
              ? 'gas-station'
              : s.kind === 'hotel'
                ? 'bed'
                : s.kind === 'camp'
                  ? 'tent'
                  : s.kind === 'freepark'
                    ? 'parking'
                    : 'map-marker-outline'
          }
          iconTone={s.auto ? 'amber' : 'accent'}
          subtitle={`${s.auto ? 'Auto gas stop' : s.kind === 'gas' ? 'Gas' : (s.note ?? 'Stop')}`}
          action="Remove"
          tone="plain"
          onAction={() => props.onRemove(s.id)}
        />
      ))}
      <Text
        style={{
          color: off.state === 'error' ? t.danger : off.state === 'ready' ? t.good : t.muted,
          fontSize: 16,
          fontFamily: font('600'),
          marginVertical: 10,
        }}
      >
        {off.state === 'idle'
          ? 'Offline maps: saved when a trip starts'
          : off.state === 'saving'
            ? `Saving offline maps along the route… ${off.percent}%`
            : off.state === 'ready'
              ? '✓ Offline maps saved along this route'
              : `Offline save failed: ${off.message ?? 'unknown error'}`}
      </Text>
      {props.sim ? (
        <View>
          <Text style={{ color: t.muted, fontSize: 15, fontFamily: font('600'), marginBottom: 4 }}>SIM SPEED</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[1, 4, 16, 60].map((n) => (
              <Chip key={n} label={`${n}×`} on={props.simSpeed === n} onPress={() => props.onSimSpeed(n)} />
            ))}
          </View>
        </View>
      ) : null}
      {props.destination ? (
        <BigButton
          icon="stop-circle-outline"
          label="End trip"
          tone="danger"
          onPress={() => {
            props.onEnd();
            props.onClose();
          }}
          style={{ marginTop: 12 }}
        />
      ) : null}
    </Sheet>
  );
}
