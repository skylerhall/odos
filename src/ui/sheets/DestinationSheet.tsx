import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import type { Place } from '../../core/places';
import { ResultRow, Sheet, useTheme } from '../controls';

/** "Where to?" — type an address or place; results update as you type. */
export function DestinationSheet(props: {
  visible: boolean;
  onClose: () => void;
  search: (q: string) => Promise<Place[]>;
  onGo: (p: Place) => void;
  onAddStop: (p: Place) => void;
  hasTrip: boolean;
}) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const r = await props.search(q.trim());
        if (id === seq.current) setResults(r);
      } catch {
        if (id === seq.current) setError('No signal. Search needs a connection.');
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [q, props.search]);

  return (
    <Sheet visible={props.visible} title="Where to?" onClose={props.onClose}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Address, place, or city"
        placeholderTextColor={t.muted}
        autoFocus
        returnKeyType="search"
        accessibilityLabel="Search for a destination"
        style={{ minHeight: 60, borderWidth: 2, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, fontSize: 20, color: t.text, backgroundColor: t.panel }}
      />
      <View style={{ minHeight: 28, justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={t.accent} /> : null}
        {error ? <Text style={{ color: t.danger, fontSize: 16 }}>{error}</Text> : null}
      </View>
      {results.map((p) => (
        <View key={p.id}>
          <ResultRow title={p.name} subtitle={p.address} action="Go" onAction={() => props.onGo(p)} />
          {props.hasTrip ? (
            <ResultRow title="" subtitle={`Add ${p.name} as a stop on this trip`} action="+ Stop" tone="plain" onAction={() => props.onAddStop(p)} />
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}
