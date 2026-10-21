import Mapbox from '@rnmapbox/maps';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { MAPBOX_TOKEN, STYLE } from '../config';
import type { LngLat } from '../core/geo';
import type { Stop } from '../core/places';
import type { Condition } from '../core/weather';
import { congestionRuns, type Route } from '../core/route';
import type { Fix } from '../state/useOdos';
import { useTheme } from './controls';
import { CONGESTION_COLORS } from './theme';
import { WeatherMapLayers } from './WeatherOverlay';

if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN);

const STOP_ICONS: Record<string, string> = { gas: '⛽', hotel: '🏨', camp: '🏕', freepark: '🅿', custom: '📍', destination: '🏁' };

export function MapPane(props: {
  night: boolean;
  traffic: boolean;
  sim: boolean;
  follow: boolean;
  fix: Fix | null;
  route: Route | null;
  stops: Stop[];
  destination: LngLat | null;
  pin: LngLat | null;
  onLongPress: (coord: LngLat) => void;
  onUserPan: () => void;
  /** Height of the bottom panel, so the driving camera keeps your position above it. */
  bottomInset: number;
  /** Rain/snow drawn inside the map scene. */
  weather: Condition | null;
  weatherFx: boolean;
  /** Trail Mode: the downloaded trail network and your breadcrumb track. */
  trail?: { lines: GeoJSON.FeatureCollection | null; track: LngLat[] } | null;
}) {
  const t = useTheme();
  const routeShape = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!props.route) return null;
    return {
      type: 'FeatureCollection',
      features: congestionRuns(props.route).map((run) => ({
        type: 'Feature',
        properties: { congestion: run.level },
        geometry: { type: 'LineString', coordinates: run.coords },
      })),
    };
  }, [props.route]);

  const markers = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = props.stops.map((s, i) => ({
      type: 'Feature',
      properties: { icon: STOP_ICONS[s.kind] ?? '📍', label: `${i + 1}. ${s.name}` },
      geometry: { type: 'Point', coordinates: s.coord },
    }));
    if (props.destination) {
      features.push({
        type: 'Feature',
        properties: { icon: '🏁', label: '' },
        geometry: { type: 'Point', coordinates: props.destination },
      });
    }
    if (props.pin)
      features.push({ type: 'Feature', properties: { icon: '📍', label: 'Pin' }, geometry: { type: 'Point', coordinates: props.pin } });
    return { type: 'FeatureCollection', features };
  }, [props.stops, props.destination, props.pin]);

  const driving = !!props.route;

  return (
    <Mapbox.MapView
      style={StyleSheet.absoluteFill}
      styleURL={props.night ? STYLE.night : props.trail ? STYLE.trail : STYLE.day}
      scaleBarEnabled={false}
      compassEnabled
      logoEnabled
      // Keep the Mapbox logo and (i) button above the bottom panel: Mapbox's terms require both to be
      // visible, and (i) is where users opt out of Mapbox telemetry (see docs/privacy-policy.md).
      logoPosition={{ bottom: props.bottomInset, left: 12 }}
      attributionEnabled
      attributionPosition={{ bottom: props.bottomInset, left: 104 }}
      onLongPress={(f) => props.onLongPress(f.geometry.coordinates as LngLat)}
      onCameraChanged={(s) => {
        if (s.gestures.isGestureActive) props.onUserPan();
      }}
    >
      <Mapbox.Camera
        followUserLocation={props.follow}
        followUserMode={driving ? Mapbox.UserTrackingMode.FollowWithCourse : Mapbox.UserTrackingMode.Follow}
        followZoomLevel={driving ? 16 : 13}
        followPitch={driving ? 50 : 0}
        followPadding={{ paddingBottom: driving ? props.bottomInset : 0 }}
        defaultSettings={{ centerCoordinate: props.fix?.coord ?? [-98.5, 39.8], zoomLevel: props.fix ? 13 : 3.5 }}
      />
      {props.sim && props.fix ? <Mapbox.CustomLocationProvider coordinate={props.fix.coord} heading={props.fix.heading ?? 0} /> : null}
      <WeatherMapLayers cond={props.weather} enabled={props.weatherFx} night={props.night} />
      <Mapbox.LocationPuck puckBearingEnabled puckBearing="course" pulsing={{ isEnabled: true, color: t.brand }} />

      {props.traffic ? (
        <Mapbox.VectorSource id="traffic" url={STYLE.trafficTiles}>
          <Mapbox.LineLayer
            id="traffic-lines"
            sourceLayerID="traffic"
            filter={['in', ['get', 'congestion'], ['literal', ['moderate', 'heavy', 'severe']]]}
            style={{
              lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 1.5, 16, 5],
              lineColor: [
                'match',
                ['get', 'congestion'],
                'moderate',
                CONGESTION_COLORS.moderate,
                'heavy',
                CONGESTION_COLORS.heavy,
                CONGESTION_COLORS.severe,
              ],
              lineOpacity: 0.8,
            }}
          />
        </Mapbox.VectorSource>
      ) : null}

      {props.trail?.lines ? (
        // Drawn from the downloaded data, so trails show even where the saved map has no detail.
        <Mapbox.ShapeSource id="trails" shape={props.trail.lines}>
          <Mapbox.LineLayer
            id="trails-road"
            filter={['==', ['get', 'kind'], 'road']}
            style={{ lineColor: props.night ? '#8C96A6' : '#7D838C', lineWidth: 1.5, lineOpacity: 0.7 }}
          />
          <Mapbox.LineLayer
            id="trails-track"
            filter={['==', ['get', 'kind'], 'track']}
            style={{ lineColor: props.night ? '#D9A464' : '#9C6A2C', lineWidth: ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 4], lineCap: 'round' }}
          />
          <Mapbox.LineLayer
            id="trails-rough"
            filter={['==', ['get', 'kind'], 'rough']}
            style={{
              lineColor: props.night ? '#FF8A50' : '#C2410C',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 4],
              lineDasharray: [2, 1],
            }}
          />
          <Mapbox.LineLayer
            id="trails-path"
            filter={['==', ['get', 'kind'], 'path']}
            style={{
              lineColor: props.night ? '#E8C49A' : '#6B4423',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 11, 1.2, 16, 3],
              lineDasharray: [1.5, 1],
            }}
          />
        </Mapbox.ShapeSource>
      ) : null}
      {props.trail && props.trail.track.length > 1 ? (
        <Mapbox.ShapeSource id="track" shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: props.trail.track } }}>
          <Mapbox.LineLayer id="track-line" style={{ lineColor: t.brand, lineWidth: 3.5, lineOpacity: 0.9, lineJoin: 'round', lineCap: 'round' }} />
        </Mapbox.ShapeSource>
      ) : null}

      {routeShape ? (
        <Mapbox.ShapeSource id="route" shape={routeShape}>
          <Mapbox.LineLayer id="route-casing" style={{ lineColor: '#0A2A66', lineWidth: 11, lineJoin: 'round', lineCap: 'round' }} />
          <Mapbox.LineLayer
            id="route-line"
            aboveLayerID="route-casing"
            style={{
              lineWidth: 7,
              lineJoin: 'round',
              lineCap: 'round',
              lineColor: [
                'match',
                ['get', 'congestion'],
                'moderate',
                CONGESTION_COLORS.moderate,
                'heavy',
                CONGESTION_COLORS.heavy,
                'severe',
                CONGESTION_COLORS.severe,
                CONGESTION_COLORS.low,
              ],
            }}
          />
        </Mapbox.ShapeSource>
      ) : null}

      <Mapbox.ShapeSource id="markers" shape={markers}>
        <Mapbox.SymbolLayer
          id="marker-icons"
          style={{
            textField: ['get', 'icon'],
            textSize: 30,
            textAllowOverlap: true,
            textAnchor: 'bottom',
          }}
        />
        <Mapbox.SymbolLayer
          id="marker-labels"
          style={{
            textField: ['get', 'label'],
            textSize: 14,
            textOffset: [0, 0.6],
            textAnchor: 'top',
            textColor: props.night ? '#FFFFFF' : '#0B1220',
            textHaloColor: props.night ? '#000000' : '#FFFFFF',
            textHaloWidth: 1.5,
            textOptional: true,
          }}
        />
      </Mapbox.ShapeSource>
    </Mapbox.MapView>
  );
}
