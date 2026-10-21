import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import type { Place } from '../../core/places';
import { ResultRow, Sheet, useTheme } from '../controls';
import { useAsync } from '../useAsync';
import { font } from '../theme';

/** "Where to?" — type an address or place; results update as you type. */
export function DestinationSheet(props: {
  onClose: () => void;
  search: (q: string) => Promise<Place[]>;
  onGo: (p: Place) => void;
  onAddStop: (p: Place) => void;
  hasTrip: boolean;
}) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  // Wait for a short pause in typing before searching.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const { search } = props;
  const query = debounced.length >= 3 ? debounced : '';
  const { data, loading, error } = useAsync(query ? () => search(query) : null, query);
  const results = query ? (data ?? []) : [];

  return (
    <Sheet visible title="Where to?" onClose={props.onClose}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Address, place, or city"
        placeholderTextColor={t.muted}
        autoFocus
        returnKeyType="search"
        accessibilityLabel="Search for a destination"
        style={{
          minHeight: 58,
          borderRadius: 16,
          paddingHorizontal: 16,
          fontSize: 19,
          color: t.text,
          backgroundColor: t.panel,
          fontFamily: font('400'),
        }}
      />
      <View style={{ minHeight: 28, justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color={t.accent} /> : null}
        {error ? (
          <Text style={{ color: t.danger, fontSize: 16, fontFamily: font('400') }}>No signal. Search needs a connection.</Text>
        ) : null}
      </View>
      {results.map((p) => (
        <View key={p.id}>
          <ResultRow title={p.name} subtitle={p.address} icon="map-marker-outline" action="Go" onAction={() => props.onGo(p)} />
          {props.hasTrip ? (
            <ResultRow
              title=""
              subtitle={`Add ${p.name} as a stop on this trip`}
              action="+ Stop"
              tone="plain"
              onAction={() => props.onAddStop(p)}
            />
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}
