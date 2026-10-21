import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { parseVehicleQuery, searchVehicles } from '../../core/vehicles/match';
import type { FuelKind, Vehicle } from '../../core/vehicles/types';
import { KWH_PER_GALLON } from '../../core/vehicles/types';
import {
  decodeVin,
  epaMakes,
  epaModels,
  epaOptions,
  epaSearch,
  epaVehicle,
  epaYears,
  vinToOptions,
  type MenuItem,
} from '../../services/vehicleLookup';
import { BigButton, Chip, ResultRow, Sheet, useTheme } from '../controls';
import { useAsync } from '../useAsync';
import { font } from '../theme';

type Mode = 'search' | 'exact' | 'vin' | 'custom';

/**
 * Pick a vehicle four ways: type to search the built-in list (works offline), walk the official
 * EPA year → make → model → engine menus (exact, needs signal), decode a VIN, or type it in.
 */
export function VehicleSheet(props: { onClose: () => void; onPick: (v: Vehicle) => void }) {
  const [mode, setMode] = useState<Mode>('search');
  const pick = (v: Vehicle) => {
    props.onPick(v);
    props.onClose();
  };
  return (
    <Sheet visible title="Your vehicle" onClose={props.onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        <Chip label="Search" on={mode === 'search'} onPress={() => setMode('search')} />
        <Chip label="Exact year" on={mode === 'exact'} onPress={() => setMode('exact')} />
        <Chip label="VIN" on={mode === 'vin'} onPress={() => setMode('vin')} />
        <Chip label="Type it in" on={mode === 'custom'} onPress={() => setMode('custom')} />
      </View>
      {mode === 'search' ? <SearchMode onPick={pick} /> : null}
      {mode === 'exact' ? <ExactMode onPick={pick} /> : null}
      {mode === 'vin' ? <VinMode onPick={pick} /> : null}
      {mode === 'custom' ? <CustomMode onPick={pick} /> : null}
    </Sheet>
  );
}

function Input(props: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder: string;
  label: string;
  numeric?: boolean;
  autoCaps?: boolean;
}) {
  const t = useTheme();
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={t.muted}
      accessibilityLabel={props.label}
      keyboardType={props.numeric ? 'decimal-pad' : 'default'}
      autoCapitalize={props.autoCaps ? 'characters' : 'none'}
      autoCorrect={false}
      style={{
        minHeight: 58,
        borderRadius: 16,
        paddingHorizontal: 16,
        fontSize: 19,
        fontFamily: font('400'),
        color: t.text,
        backgroundColor: t.panel,
        marginBottom: 10,
      }}
    />
  );
}

const detail = (v: Vehicle) =>
  v.fuel === 'ev'
    ? `${v.mpg} MPGe · ${Math.round(v.tankGal * KWH_PER_GALLON)} kWh · ~${Math.round(v.mpg * v.tankGal)} mi`
    : `${v.mpg} mpg · ${v.tankGal} gal · ~${Math.round(v.mpg * v.tankGal)} mi`;

// Last search typed, kept while the app is open so reopening the sheet doesn't start over.
let lastVehicleQuery = '';

function SearchMode({ onPick }: { onPick: (v: Vehicle) => void }) {
  const t = useTheme();
  const [q, setQ] = useState(lastVehicleQuery);
  const [settled, setSettled] = useState(lastVehicleQuery);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState(false);
  const results = useMemo(() => searchVehicles(q), [q]);
  const shown = results.slice(0, 40);
  const onChange = (s: string) => {
    lastVehicleQuery = s;
    setQ(s);
  };

  // With a model year typed, also ask the EPA for exact matches (once typing pauses).
  useEffect(() => {
    const timer = setTimeout(() => setSettled(q.trim()), 700);
    return () => clearTimeout(timer);
  }, [q]);
  const parsed = useMemo(() => parseVehicleQuery(settled), [settled]);
  const wantEpa = parsed.year != null && parsed.words.length > 0;
  const epa = useAsync(wantEpa ? () => epaSearch(parsed) : null, settled);

  const pickEpa = async (id: string) => {
    setPicking(true);
    setPickError(false);
    try {
      onPick(await epaVehicle(id));
    } catch {
      setPickError(true);
    } finally {
      setPicking(false);
    }
  };

  const yearTyped = parseVehicleQuery(q).year != null;
  return (
    <View>
      <Input value={q} onChangeText={onChange} placeholder='Try "2007 tundra 4.7" or "dodge"' label="Search vehicles" />
      {q.trim() ? (
        <Text style={{ color: t.muted, fontSize: 15, marginBottom: 4, fontFamily: font('400') }}>
          {results.length === 0
            ? yearTyped
              ? 'Not in the built-in list. Checking the EPA list below…'
              : 'Not in the built-in list. Add the year (e.g. “2007 tundra”) to search every EPA-rated vehicle.'
            : `${results.length} match${results.length === 1 ? '' : 'es'}${results.length > shown.length ? ` · showing ${shown.length}, add a model or engine to narrow` : ''}${
                yearTyped ? '' : ' · add the year for exact EPA figures'
              }`}
        </Text>
      ) : null}
      {shown.map((v) => (
        <ResultRow
          key={v.id}
          title={`${v.make} ${v.model}`}
          subtitle={v.years ? `${v.years} · ${v.engine}` : v.engine}
          detail={detail(v)}
          action="Pick"
          onAction={() => onPick(v)}
        />
      ))}

      {wantEpa || (yearTyped && q.trim() !== settled) ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: t.muted, fontSize: 15, fontFamily: font('700') }}>EXACT MATCHES · EPA (fueleconomy.gov)</Text>
          {epa.loading || q.trim() !== settled || picking ? <ActivityIndicator color={t.accent} style={{ margin: 12 }} /> : null}
          {epa.error ? (
            <Text style={{ color: t.danger, fontSize: 16, fontFamily: font('400') }}>
              Couldn’t reach the EPA list. It needs a connection.
            </Text>
          ) : null}
          {pickError ? (
            <Text style={{ color: t.danger, fontSize: 16, fontFamily: font('400') }}>Couldn’t load that vehicle. Try again.</Text>
          ) : null}
          {!epa.loading && epa.data && epa.data.length === 0 && q.trim() === settled ? (
            <Text style={{ color: t.text, fontSize: 16, fontFamily: font('400') }}>
              No EPA match for “{settled}”. Check the spelling, or try just the year and model.
            </Text>
          ) : null}
          {epa.data?.map((m) => (
            <ResultRow key={m.id} title={m.title} subtitle={m.detail} action="Pick" onAction={() => pickEpa(m.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ExactMode({ onPick }: { onPick: (v: Vehicle) => void }) {
  const t = useTheme();
  const [path, setPath] = useState<{ year?: MenuItem; make?: MenuItem; model?: MenuItem }>({});
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const step: 'year' | 'make' | 'model' | 'option' = !path.year ? 'year' : !path.make ? 'make' : !path.model ? 'model' : 'option';
  const { year, make, model } = path;
  const menu = useAsync(
    () =>
      !year
        ? epaYears().then((y) => y.sort((a, b) => Number(b.value) - Number(a.value)))
        : !make
          ? epaMakes(year.value)
          : !model
            ? epaModels(year.value, make.value)
            : epaOptions(year.value, make.value, model.value),
    `${year?.value}|${make?.value}|${model?.value}`,
  );
  const items = menu.data ?? [];
  const busy = menu.loading || picking;
  const error = pickError ?? (menu.error ? 'Couldn’t reach fueleconomy.gov. Use Search for the offline list.' : null);

  const choose = async (item: MenuItem) => {
    if (step === 'year') setPath({ year: item });
    else if (step === 'make') setPath({ ...path, make: item });
    else if (step === 'model') setPath({ ...path, model: item });
    else {
      setPicking(true);
      setPickError(null);
      try {
        onPick(await epaVehicle(item.value));
      } catch {
        setPickError('Couldn’t load that vehicle. Try again.');
      } finally {
        setPicking(false);
      }
    }
  };

  const crumbs = [path.year?.text, path.make?.text, path.model?.text].filter(Boolean).join(' › ');
  return (
    <View>
      <Text style={{ color: t.text, fontSize: 18, fontFamily: font('700'), marginBottom: 6 }}>
        {`Choose ${step === 'option' ? 'engine' : step}`}
        {crumbs ? <Text style={{ color: t.muted, fontFamily: font('500') }}>{`   ${crumbs}`}</Text> : null}
      </Text>
      {crumbs ? (
        <BigButton
          label="◀ Back"
          onPress={() => setPath(step === 'option' ? { year: path.year, make: path.make } : step === 'model' ? { year: path.year } : {})}
          style={{ marginBottom: 8 }}
        />
      ) : null}
      {busy ? <ActivityIndicator color={t.accent} style={{ margin: 12 }} /> : null}
      {error ? <Text style={{ color: t.danger, fontSize: 16, fontFamily: font('400') }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {items.map((i) => (
          <Chip key={i.value} label={i.text} onPress={() => choose(i)} />
        ))}
      </View>
    </View>
  );
}

function VinMode({ onPick }: { onPick: (v: Vehicle) => void }) {
  const t = useTheme();
  const [vin, setVin] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [options, setOptions] = useState<MenuItem[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setOptions([]);
    setStatus(null);
    try {
      const info = await decodeVin(vin);
      if (!info) return setStatus('That doesn’t look like a 17-character VIN.');
      setStatus(`${info.year} ${info.make} ${info.model}${info.displacementL ? ` · ${info.displacementL.toFixed(1)}L` : ''}`);
      const opts = await vinToOptions(info);
      setOptions(opts);
      if (opts.length === 0) setStatus((s) => `${s}\nNo EPA match. Try Search instead.`);
    } catch {
      setStatus('Couldn’t reach NHTSA. VIN lookup needs a connection.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <Input value={vin} onChangeText={(s) => setVin(s.toUpperCase())} placeholder="17-character VIN" label="VIN" autoCaps />
      <BigButton label="Decode VIN" tone="accent" onPress={run} disabled={vin.trim().length !== 17 || busy} />
      {busy ? <ActivityIndicator color={t.accent} style={{ margin: 12 }} /> : null}
      {status ? <Text style={{ color: t.text, fontSize: 17, fontFamily: font('600'), marginTop: 10 }}>{status}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {options.map((o) => (
          <Chip key={o.value} label={o.text} onPress={async () => onPick(await epaVehicle(o.value))} />
        ))}
      </View>
    </View>
  );
}

function CustomMode({ onPick }: { onPick: (v: Vehicle) => void }) {
  const [name, setName] = useState('');
  const [mpg, setMpg] = useState('');
  const [tank, setTank] = useState('');
  const [fuel, setFuel] = useState<FuelKind>('gas');
  const ev = fuel === 'ev';
  const ok = Number(mpg) > 0 && Number(tank) > 0;
  return (
    <View>
      <Input value={name} onChangeText={setName} placeholder="Name, e.g. 2014 Tacoma" label="Vehicle name" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(['gas', 'diesel', 'hybrid', 'ev'] as FuelKind[]).map((f) => (
          <Chip key={f} label={f === 'ev' ? 'Electric' : f[0].toUpperCase() + f.slice(1)} on={fuel === f} onPress={() => setFuel(f)} />
        ))}
      </View>
      <Input value={mpg} onChangeText={setMpg} placeholder={ev ? 'MPGe (e.g. 110)' : 'MPG (e.g. 22)'} label="Fuel economy" numeric />
      <Input
        value={tank}
        onChangeText={setTank}
        placeholder={ev ? 'Battery kWh (e.g. 75)' : 'Tank gallons (e.g. 18)'}
        label="Tank size"
        numeric
      />
      <BigButton
        label="Use this vehicle"
        tone="accent"
        disabled={!ok}
        onPress={() =>
          onPick({
            id: `custom-${Date.now()}`,
            make: name.trim() || 'My',
            model: name.trim() ? '' : 'vehicle',
            engine: 'Custom',
            mpg: Number(mpg),
            tankGal: ev ? Number(tank) / KWH_PER_GALLON : Number(tank),
            fuel,
            source: 'custom',
          })
        }
      />
    </View>
  );
}
