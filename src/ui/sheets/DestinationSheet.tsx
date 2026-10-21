import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Place } from '../../core/places';
import { MAX_SHORTCUTS, type Shortcut, type ShortcutIcon } from '../../core/saved';
import type { SearchResponse, SearchResult } from '../../services/placeSearch';
import { BigButton, Icon, type IconName, PressScale, ResultRow, Sheet, useTheme } from '../controls';
import { distance, duration } from '../format';
import { useAsync } from '../useAsync';
import { font, RADIUS } from '../theme';

const KIND_ICON: Partial<Record<Place['kind'], IconName>> = { gas: 'gas-station', hotel: 'bed', camp: 'tent', freepark: 'parking' };
const SHORTCUT_ICON: Record<ShortcutIcon, IconName> = { home: 'home', work: 'briefcase', star: 'star' };

const howFar = (p: SearchResult) =>
  p.meters == null ? undefined : p.driveSeconds != null ? `${duration(p.driveSeconds)} · ${distance(p.meters)}` : `${distance(p.meters)} away`;

type Assigning = { key: string; label: string; existing: boolean };

/**
 * "Where to?" — type an address or place; results update as you type. "Nearest gas station",
 * "coffee near me" and the like list what's closest by drive time. Before typing: Home/Work/custom
 * shortcuts (tap to go, hold to change) and recent places.
 */
export function DestinationSheet(props: {
  onClose: () => void;
  search: (q: string) => Promise<SearchResponse>;
  onGo: (p: Place) => void;
  onAddStop: (p: Place) => void;
  hasTrip: boolean;
  shortcuts: Shortcut[];
  recents: Place[];
  onSaveShortcut: (key: string, p: Place) => void;
  onRemoveShortcut: (key: string) => void;
  onAddShortcut: (label: string) => string | null;
  onClearRecents: () => void;
}) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  // Picking the address for a shortcut instead of navigating.
  const [assigning, setAssigning] = useState<Assigning | null>(null);
  // Typing the name of a new custom shortcut.
  const [naming, setNaming] = useState<string | null>(null);

  // Wait for a short pause in typing before searching.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const { search } = props;
  const query = debounced.length >= 3 ? debounced : '';
  const { data, loading, error } = useAsync(query ? () => search(query) : null, query);
  const results = query ? (data?.places ?? []) : [];
  const heading = query ? data?.heading : null;
  const anySaved = props.shortcuts.some((s) => s.place) || props.recents.length > 0;

  const startAssigning = (s: Shortcut) => {
    setAssigning({ key: s.key, label: s.label, existing: !!s.place });
    setQ('');
  };
  const finishAssigning = () => {
    setAssigning(null);
    setQ('');
  };
  const addCustom = () => {
    const name = (naming ?? '').trim();
    if (!name) return;
    const key = props.onAddShortcut(name);
    setNaming(null);
    if (key) setAssigning({ key, label: name, existing: false });
  };

  return (
    <Sheet visible title={assigning ? `Set ${assigning.label}` : 'Where to?'} onClose={props.onClose}>
      {assigning ? (
        <Text style={[styles.note, { color: t.muted }]}>Search for the address, then tap Save.</Text>
      ) : null}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={assigning ? `${assigning.label} address` : 'Address, place, or “nearest gas”'}
        placeholderTextColor={t.muted}
        // With shortcuts or recents to tap, don't cover them with the keyboard straight away.
        autoFocus={!anySaved || !!assigning}
        returnKeyType="search"
        accessibilityLabel={assigning ? `Search for the ${assigning.label} address` : 'Search for a destination'}
        style={[styles.input, { color: t.text, backgroundColor: t.panel }]}
      />
      <View style={{ minHeight: 28, justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color={t.accent} /> : null}
        {error ? <Text style={[styles.body, { color: t.danger }]}>No signal. Search needs a connection.</Text> : null}
        {heading && !loading ? <Text style={[styles.heading, { color: t.muted, marginTop: 4 }]}>{heading.toUpperCase()}</Text> : null}
        {query && data && !results.length && !loading ? (
          <Text style={[styles.body, { color: t.text }]}>Nothing found. Try different words.</Text>
        ) : null}
      </View>

      {results.map((p) => (
        <View key={p.id}>
          <ResultRow
            title={p.name}
            subtitle={p.address}
            detail={howFar(p)}
            icon={KIND_ICON[p.kind] ?? 'map-marker-outline'}
            action={assigning ? 'Save' : 'Go'}
            onAction={() => {
              if (!assigning) return props.onGo(p);
              props.onSaveShortcut(assigning.key, p);
              finishAssigning();
            }}
          />
          {props.hasTrip && !assigning ? (
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

      {assigning && !query ? (
        <View style={{ gap: 10 }}>
          {assigning.existing || assigning.key.startsWith('custom:') ? (
            <BigButton
              icon="delete-outline"
              label={assigning.key.startsWith('custom:') ? `Remove ${assigning.label}` : `Clear ${assigning.label}`}
              tone="danger"
              onPress={() => {
                props.onRemoveShortcut(assigning.key);
                finishAssigning();
              }}
            />
          ) : null}
          <BigButton icon="arrow-left" label="Back" tone="soft" onPress={finishAssigning} />
        </View>
      ) : null}

      {!assigning && !query ? (
        <>
          <View style={styles.tiles}>
            {props.shortcuts.map((s) => (
              <ShortcutTile key={s.key} shortcut={s} onGo={props.onGo} onEdit={() => startAssigning(s)} />
            ))}
            {props.shortcuts.length < MAX_SHORTCUTS && naming == null ? (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel="Add a shortcut"
                accessibilityHint="Name a place you go often, like Gym or School"
                onPress={() => setNaming('')}
                style={styles.tile}
              >
                <View style={[styles.well, styles.wellEmpty, { borderColor: t.border }]}>
                  <Icon name="plus" size={26} color={t.muted} />
                </View>
                <Text style={[styles.tileLabel, { color: t.muted }]}>Add</Text>
              </PressScale>
            ) : null}
          </View>
          {naming != null ? (
            <View style={styles.nameRow}>
              <TextInput
                value={naming}
                onChangeText={setNaming}
                placeholder="Name, like Gym"
                placeholderTextColor={t.muted}
                autoFocus
                maxLength={16}
                returnKeyType="next"
                onSubmitEditing={addCustom}
                accessibilityLabel="Shortcut name"
                style={[styles.input, { flex: 1, color: t.text, backgroundColor: t.panel }]}
              />
              <BigButton label="Next" tone="accent" onPress={addCustom} disabled={!naming.trim()} style={{ marginLeft: 8, minWidth: 88 }} />
            </View>
          ) : null}
          {props.shortcuts.some((s) => s.place) ? (
            <Text style={[styles.note, { color: t.muted, marginTop: 2 }]}>Hold a shortcut to change it.</Text>
          ) : null}

          {props.recents.length ? (
            <>
              <View style={styles.recentHead}>
                <Text style={[styles.heading, { color: t.muted }]}>RECENT</Text>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel="Clear recent places"
                  onPress={props.onClearRecents}
                  style={styles.clear}
                >
                  <Text style={[styles.clearText, { color: t.accent }]}>Clear</Text>
                </PressScale>
              </View>
              {props.recents.map((p) => (
                <View key={p.id}>
                  <ResultRow title={p.name} subtitle={p.address} icon="history" action="Go" onAction={() => props.onGo(p)} />
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
            </>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

/** Tap to go (or to set it, if it's empty); hold to change or remove. */
function ShortcutTile({ shortcut: s, onGo, onEdit }: { shortcut: Shortcut; onGo: (p: Place) => void; onEdit: () => void }) {
  const t = useTheme();
  const set = !!s.place;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={set ? `${s.label}: ${s.place!.name}` : `${s.label}, not set`}
      accessibilityHint={set ? 'Starts directions. Hold to change it.' : `Choose your ${s.label.toLowerCase()} address`}
      accessibilityActions={set ? [{ name: 'longpress', label: `Change ${s.label}` }] : undefined}
      onAccessibilityAction={onEdit}
      onPress={() => (s.place ? onGo(s.place) : onEdit())}
      onLongPress={onEdit}
      delayLongPress={400}
      style={styles.tile}
    >
      <View style={[styles.well, set ? { backgroundColor: t.accentSoft } : [styles.wellEmpty, { borderColor: t.border }]]}>
        <Icon name={SHORTCUT_ICON[s.icon]} size={26} color={set ? t.accent : t.muted} />
      </View>
      <Text style={[styles.tileLabel, { color: set ? t.text : t.muted }]} numberOfLines={1}>
        {s.label}
      </Text>
      {!set ? <Text style={[styles.tileSub, { color: t.accent }]}>Set</Text> : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 58, borderRadius: 16, paddingHorizontal: 16, fontSize: 19, fontFamily: font('400') },
  note: { fontSize: 15, fontFamily: font('500'), marginBottom: 8 },
  body: { fontSize: 16, fontFamily: font('400') },
  heading: { fontSize: 15, fontFamily: font('700') },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 4 },
  tile: { width: 78, minHeight: 88, alignItems: 'center', paddingVertical: 4, marginHorizontal: 4 },
  well: { width: 56, height: 56, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  wellEmpty: { borderWidth: 1.5, borderStyle: 'dashed' },
  tileLabel: { fontSize: 14, fontFamily: font('600'), marginTop: 4, maxWidth: 76 },
  tileSub: { fontSize: 12, fontFamily: font('700') },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  clear: { minHeight: 44, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center' },
  clearText: { fontSize: 15, fontFamily: font('700') },
});
