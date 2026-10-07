import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Icon } from '../../../components/layout/Icon';
import type { DeploymentObjective, DeploymentSetup, DeploymentUnit, SimulationResult, SimulationResultPosition, SimulationRuntimeState, SimulationUnit, TacticalGraphic } from '../../../types';
import { create3DTerrainMapStyle, createDefaultMapStyle, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getMapStyleUrl } from '../lib/mapConfig';
import { getLngLat } from '../lib/position';
import { ensureAxisArrowImage, ensureExplosionFrameImages, ensureMilitarySymbolImage, ensureObjectiveImage, EXPLOSION_FRAME_COUNT, getExplosionFrameImageId, getMilitarySymbolImageId } from '../lib/militarySymbolRegistry';
import { getTrackPositionsAtTime, isUnitEliminated } from '../lib/playback';
import { toObservationSectorFeatures } from '../lib/observation';
import { toTacticalGraphicAxisArrowFeatures, toTacticalGraphicFeatureCollection } from '../lib/tacticalGraphics';
import { resolvePlanReference } from '../lib/planReferenceMapping';
import { buildSecurityVisual } from '../lib/securityVisual';
import { get3DUnitSymbolSize } from '../lib/symbolSvg';
import {
  addDeploymentSourcesAndLayers,
  AXIS_ARROW_SOURCE_ID,
  ACTION_EFFECT_SOURCE_ID,
  GRAPHICS_SOURCE_ID,
  OBJECTIVE_SOURCE_ID,
  OBSERVATION_SECTOR_SOURCE_ID,
  UNIT_SOURCE_ID,
} from '../lib/tacticalMapLayers';

type TacticalMapProps = {
  runtime: SimulationRuntimeState;
  playbackRef?: { current: SimulationRuntimeState };
  units: SimulationUnit[];
  result: SimulationResult;
  deployment?: DeploymentSetup;
  onSelectUnit: (unitId: string) => void;
  terrain3D?: boolean;
  revisedUnits?: DeploymentUnit[];
  revisedObjectives?: DeploymentObjective[];
  revisedTacticalGraphics?: TacticalGraphic[];
  hiddenBaseUnitIds?: string[];
};

function getMapCenter(result: SimulationResult): [number, number] {
  const positions = result.unitTracks.flatMap((track) => {
    const initial = track.segments
      .flatMap((segment) => segment.keyframes)
      .sort((first, second) => first.time - second.time)[0]?.position;
    return initial ? [initial] : [];
  });
  if (positions.length === 0) {
    return DEFAULT_MAP_CENTER;
  }

  const totals = positions.reduce(
    (current, position) => ({
      longitude: current.longitude + position.longitude,
      latitude: current.latitude + position.latitude,
    }),
    { longitude: 0, latitude: 0 },
  );

  return [totals.longitude / positions.length, totals.latitude / positions.length];
}

function toUnitFeatures(
  result: SimulationResult,
  units: SimulationUnit[],
  simulationTime: number,
  normalized3D = false,
  positions = getTrackPositionsAtTime(result, simulationTime),
  unitById = new Map(units.map((unit) => [unit.id, unit])),
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const positionedIds = new Set(positions.map(({ unitId }) => unitId));
  const staticPositions = units.flatMap((unit) => (
    !positionedIds.has(unit.id) && !isUnitEliminated(result, unit.id, simulationTime) && unit.geographicPosition
      ? [{ unitId: unit.id, actor: unit.name, position: unit.geographicPosition }]
      : []
  ));

  return {
    type: 'FeatureCollection',
    features: [...positions, ...staticPositions].flatMap(({ unitId, actor, position }) => {
      const unit = unitById.get(unitId);
      const sidc = unit?.sidc;

      if (!position || !sidc) {
        console.warn(`Simulation playback skipped unresolved unit track: ${unitId} (${actor})`);
        return [];
      }

      return [
        {
          type: 'Feature' as const,
          id: unitId,
          properties: {
            id: unitId,
            designation: unit.name,
            sidc,
            imageId: getMilitarySymbolImageId(sidc, unit.symbolStandard, normalized3D),
            affiliation: unit.allegiance === 'Enemy' ? 'enemy' : 'friendly',
            unitType: unit.type,
            echelon: 'company',
            symbolScale: normalized3D ? get3DUnitSymbolSize(unit.symbolScale) * 2.4 / 128 : unit.symbolScale ?? 1,
            symbolRotation: unit.symbolRotation ?? 0,
          },
          geometry: { type: 'Point' as const, coordinates: [position.longitude, position.latitude] },
        },
      ];
    }),
  };
}

function toRevisedUnitFeatures(units: DeploymentUnit[], normalized3D = false): GeoJSON.Feature<GeoJSON.Point>[] {
  return units.map(unit => ({
    type: 'Feature',
    id: unit.id,
    properties: {
      id: unit.id,
      designation: unit.designation,
      sidc: unit.sidc,
      imageId: getMilitarySymbolImageId(unit.sidc, unit.symbolStandard, normalized3D),
      affiliation: unit.affiliation,
      unitType: unit.unitType,
      echelon: unit.echelon,
      symbolScale: normalized3D ? get3DUnitSymbolSize(unit.symbolScale) * 2.4 / 128 : unit.symbolScale ?? 1,
      symbolRotation: unit.symbolRotation ?? 0,
    },
    geometry: { type: 'Point', coordinates: getLngLat(unit.position) },
  }));
}

function toRouteFeatures(result: SimulationResult, simulationTime: number): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: result.unitTracks.flatMap((track) =>
      track.segments.filter((segment) =>
        (segment.action === 'Move' || segment.action === 'Withdraw')
        && segment.startTime <= simulationTime
        && simulationTime < segment.endTime,
      ).map((segment) => ({
        type: 'Feature' as const,
        id: `track-${track.unitId}-${segment.actionSequence}`,
        properties: {
          id: `track-${track.unitId}-${segment.actionSequence}`,
          type: 'route',
          name: `${track.actor} ${segment.action}`,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: segment.keyframes.map((keyframe) => [keyframe.position.longitude, keyframe.position.latitude] as [number, number]),
        },
      })),
    ),
  };
}

function toObjectiveFeatures(deployment?: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return { type: 'FeatureCollection', features: (deployment?.objectives ?? []).flatMap(objective => {
    const longitude = objective.position.longitude ?? objective.position.lon; const latitude = objective.position.latitude ?? objective.position.lat;
    return typeof longitude === 'number' && typeof latitude === 'number' ? [{ type: 'Feature' as const, id: objective.id, properties: { id: objective.id, name: objective.name, symbolScale: .75 }, geometry: { type: 'Point' as const, coordinates: [longitude, latitude] } }] : [];
  }) };
}

type ActionEffectFeatureProperties = {
  kind: 'action-line' | 'action-marker' | 'fire-vfx' | 'security-sector' | 'security-boundary' | 'security-pulse';
  color: string;
  radius: number;
  opacity?: number;
  action: string;
  imageId?: string;
};

const FIRE_ACTIONS = new Set(['Disrupt', 'Engage', 'Fight', 'Continue to Engage', 'Ambush', 'Contain']);
const ACTION_COLORS: Record<string, string> = {
  Disrupt: '#ff9f43', 'Establish Security': '#5bd4ff', Report: '#a78bfa', Identify: '#b4c5ff', Confirm: '#b4c5ff', Integrate: '#60a5fa',
  Engage: '#ff5d5d', Decide: '#ffd166', Contain: '#fb923c', Fight: '#ff5d5d', 'Continue to Engage': '#ff7b7b', Breach: '#ffd166',
  Clear: '#5bd4ff', Seize: '#64e7a2', 'Confirm Control': '#64e7a2',
};
const DEFAULT_ACTION_COLOR = '#ffb95f';

function asEffectPosition(value: unknown): SimulationResultPosition | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<SimulationResultPosition> & { lng?: number; lat?: number };
  const longitude = candidate.longitude ?? candidate.lng;
  const latitude = candidate.latitude ?? candidate.lat;
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? { longitude: longitude as number, latitude: latitude as number }
    : undefined;
}

function toActionEffectFeatures(
  result: SimulationResult,
  simulationTime: number,
  deployment?: DeploymentSetup,
  showFireVfx = false,
  positions = getTrackPositionsAtTime(result, simulationTime),
): GeoJSON.FeatureCollection<GeoJSON.Geometry, ActionEffectFeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.Geometry, ActionEffectFeatureProperties>[] = [];
  for (const effect of result.actionEffects ?? []) {
    if (effect.startTime > simulationTime || simulationTime >= effect.endTime) continue;
    const targetValues = [
      effect.parameters.target,
      effect.parameters.destination,
      effect.parameters.effectArea,
      effect.parameters.result,
      effect.parameters.recipient,
    ];
    const target = targetValues.find(value => typeof value === 'string') as string | undefined;
    const directTarget = targetValues.map(asEffectPosition).find(Boolean);
    const actionColor = ACTION_COLORS[effect.action] ?? DEFAULT_ACTION_COLOR;
    const origin = positions.find((position) => position.unitId === effect.unitId || position.actor === effect.actor)?.position ?? effect.origin;
    if (!origin) continue;
    if (effect.action === 'Establish Security') {
      const elapsed = simulationTime - effect.startTime;
      const progress = elapsed / Math.max(0.01, effect.endTime - effect.startTime);
      const visual = buildSecurityVisual(origin, elapsed, progress);
      visual.sectors.forEach((coordinates, index) => features.push({
        type: 'Feature', id: `security-sector-${effect.actionSequence}-${index}`,
        properties: { kind: 'security-sector', color: actionColor, radius: 0, action: effect.action },
        geometry: { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] },
      }));
      features.push({
        type: 'Feature', id: `security-boundary-${effect.actionSequence}`,
        properties: { kind: 'security-boundary', color: actionColor, radius: 0, action: effect.action },
        geometry: { type: 'LineString', coordinates: visual.boundaryPath },
      });
      features.push({
        type: 'Feature', id: `security-pulse-${effect.actionSequence}`,
        properties: { kind: 'security-pulse', color: actionColor, radius: 0, opacity: visual.pulseOpacity, action: effect.action },
        geometry: { type: 'LineString', coordinates: visual.pulsePath },
      });
      continue;
    }
    // Plans target stable unit IDs (for example, "blue-main-tank"), while
    // tracks also carry a human-readable designation. Resolve either form
    // against the live playback position before falling back to map references.
    const targetPosition = directTarget ?? (target
      ? positions.find((position) => position.unitId === target || position.actor === target)?.position ?? resolvePlanReference(deployment, target)
      : origin);
    if (!targetPosition) continue;
    const isFireLine = FIRE_ACTIONS.has(effect.action);
    const color = isFireLine ? '#ff4d4f' : actionColor;
    features.push({ type: 'Feature', id: `action-line-${effect.actionSequence}`, properties: { kind: 'action-line', color, radius: 0, action: effect.action }, geometry: { type: 'LineString', coordinates: [[origin.longitude, origin.latitude], [targetPosition.longitude, targetPosition.latitude]] } });
    if (isFireLine && showFireVfx) {
      const progress = Math.max(0, Math.min(1, (simulationTime - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime)));
      const frame = Math.floor(progress * EXPLOSION_FRAME_COUNT * 2) % EXPLOSION_FRAME_COUNT;
      features.push({
        type: 'Feature', id: `fire-vfx-${effect.actionSequence}`,
        properties: { kind: 'fire-vfx', color, radius: 0, action: effect.action, imageId: getExplosionFrameImageId(frame) },
        geometry: { type: 'Point', coordinates: [targetPosition.longitude, targetPosition.latitude] },
      });
    } else if (!isFireLine) {
      const elapsed = (simulationTime - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime);
      features.push({ type: 'Feature', id: `action-marker-${effect.actionSequence}`, properties: { kind: 'action-marker', color, radius: 12 + Math.round(elapsed * 16), action: effect.action }, geometry: { type: 'Point', coordinates: [targetPosition.longitude, targetPosition.latitude] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function TacticalMap({
  runtime, playbackRef, units, result, deployment, onSelectUnit, terrain3D = false,
  revisedUnits = [], revisedObjectives = [], revisedTacticalGraphics = [], hiddenBaseUnitIds = [],
}: TacticalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectUnitRef = useRef(onSelectUnit);
  const fallbackPlaybackRef = useRef(runtime);
  useEffect(() => { onSelectUnitRef.current = onSelectUnit; }, [onSelectUnit]);
  useEffect(() => { fallbackPlaybackRef.current = runtime; }, [runtime]);
  const clock = playbackRef ?? fallbackPlaybackRef;
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const mapCenter = useMemo(() => getMapCenter(result), [result]);
  const mapZoom = deployment?.mapView?.zoom ?? DEFAULT_MAP_ZOOM + 1;
  const displayDeployment = useMemo<DeploymentSetup | undefined>(() => deployment ? {
    ...deployment,
    units: [
      ...deployment.units.filter(unit => !hiddenBaseUnitIds.includes(unit.id) && !revisedUnits.some(revised => revised.id === unit.id)),
      ...revisedUnits,
    ],
    objectives: [...deployment.objectives, ...revisedObjectives],
    tacticalGraphics: [...deployment.tacticalGraphics, ...revisedTacticalGraphics],
  } : undefined, [deployment, hiddenBaseUnitIds, revisedObjectives, revisedTacticalGraphics, revisedUnits]);
  const tacticalGraphicFeatures = useMemo(() => toTacticalGraphicFeatureCollection(displayDeployment), [displayDeployment]);
  const axisArrowFeatures = useMemo(() => toTacticalGraphicAxisArrowFeatures(displayDeployment), [displayDeployment]);
  const objectiveFeatures = useMemo(() => toObjectiveFeatures(displayDeployment), [displayDeployment]);
  const unitById = useMemo(() => new Map(units.map(unit => [unit.id, unit])), [units]);
  const hiddenBaseUnitIdSet = useMemo(() => new Set(hiddenBaseUnitIds), [hiddenBaseUnitIds]);
  const revisedUnitIdSet = useMemo(() => new Set(revisedUnits.map(unit => unit.id)), [revisedUnits]);
  const revisedUnitFeatures = useMemo(() => toRevisedUnitFeatures(revisedUnits, terrain3D), [revisedUnits, terrain3D]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    setMapReady(false);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: terrain3D ? create3DTerrainMapStyle() : getMapStyleUrl() ?? createDefaultMapStyle(),
      center: mapCenter,
      zoom: mapZoom,
      attributionControl: false,
      pitch: terrain3D ? 60 : 0,
      bearing: terrain3D ? -12 : 0,
      maxPitch: terrain3D ? 85 : 60,
      canvasContextAttributes: terrain3D ? { antialias: true } : undefined,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: terrain3D, visualizePitch: terrain3D }), 'top-right');
    if (terrain3D) map.addControl(new maplibregl.TerrainControl({ source: 'terrainSource', exaggeration: 1.2 }), 'top-right');

    const handleLoad = async () => {
      try {
        await ensureObjectiveImage(map);
        await ensureAxisArrowImage(map);
        if (terrain3D) await ensureExplosionFrameImages(map);
        await Promise.all([
          ...units.flatMap((unit) => (unit.sidc ? [ensureMilitarySymbolImage(map, unit.sidc, unit.symbolStandard, terrain3D)] : [])),
          ...revisedUnits.map(unit => ensureMilitarySymbolImage(map, unit.sidc, unit.symbolStandard, terrain3D)),
        ]);
        addDeploymentSourcesAndLayers(map);
        const geographicPositions = units.flatMap((unit) => unit.geographicPosition ? [[unit.geographicPosition.longitude, unit.geographicPosition.latitude] as [number, number]] : []);
        if (geographicPositions.length > 1) {
          const bounds = geographicPositions.reduce(
            (current, coordinate) => current.extend(coordinate),
            new maplibregl.LngLatBounds(geographicPositions[0], geographicPositions[0]),
          );
          map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 0 });
        }
        setMapReady(true);
      } catch (error) {
        console.error(error);
        setMapError(true);
      }
    };

    const handleError = () => {
      setMapError(true);
    };

    map.once('load', handleLoad);
    map.on('error', handleError);
    map.on('click', 'deployment-units', (event) => {
      const feature = event.features?.[0];
      const unitId = feature?.properties?.id;
      if (typeof unitId === 'string') {
        onSelectUnitRef.current(unitId);
      }
    });
    map.on('mouseenter', 'deployment-units', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'deployment-units', () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // Agent state changes every playback frame. Recreating the MapLibre map for
  // those state updates races style loading and crashes on setPaintProperty.
  }, [mapCenter, mapZoom, terrain3D]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    void Promise.all(revisedUnits.map(unit => ensureMilitarySymbolImage(map, unit.sidc, unit.symbolStandard, terrain3D)));
  }, [mapReady, revisedUnits, terrain3D]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let frame = 0;
    let lastTime: number | undefined;
    let lastUpdate = -Infinity;
    const updateIntervalMs = 50;
    const tick = (timestamp: number) => {
      const { simulationTime, isPlaying } = clock.current;
      // Build and submit one coherent playback snapshot at 20 Hz. Previously
      // the collections were rebuilt at display refresh rate and then serialized
      // just to discard most frames, which stalled the main thread on 3D terrain.
      if (simulationTime !== lastTime && (!isPlaying || timestamp - lastUpdate >= updateIntervalMs)) {
        const positions = getTrackPositionsAtTime(result, simulationTime);
        const unitFeatures = toUnitFeatures(result, units, simulationTime, terrain3D, positions, unitById).features
          .filter(feature => !hiddenBaseUnitIdSet.has(String(feature.properties?.id)) && !revisedUnitIdSet.has(String(feature.properties?.id)));
        (map.getSource(UNIT_SOURCE_ID) as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: [...unitFeatures, ...revisedUnitFeatures],
        });
        (map.getSource(OBSERVATION_SECTOR_SOURCE_ID) as GeoJSONSource | undefined)
          ?.setData(toObservationSectorFeatures(result, simulationTime, displayDeployment));
        (map.getSource(ACTION_EFFECT_SOURCE_ID) as GeoJSONSource | undefined)
          ?.setData(toActionEffectFeatures(result, simulationTime, displayDeployment, terrain3D, positions));
        lastTime = simulationTime;
        lastUpdate = timestamp;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, displayDeployment, hiddenBaseUnitIdSet, mapReady, result, revisedUnitFeatures, revisedUnitIdSet, terrain3D, unitById, units]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const graphicsSource = map.getSource(GRAPHICS_SOURCE_ID) as GeoJSONSource | undefined;
    const objectiveSource = map.getSource(OBJECTIVE_SOURCE_ID) as GeoJSONSource | undefined;
    const axisSource = map.getSource(AXIS_ARROW_SOURCE_ID) as GeoJSONSource | undefined;

    graphicsSource?.setData({
      type: 'FeatureCollection',
      features: [
        ...(runtime.tacticalLayers.controlLines ? tacticalGraphicFeatures.features : []),
        ...(runtime.tacticalLayers.routes ? toRouteFeatures(result, clock.current.simulationTime).features : []),
      ],
    });
    objectiveSource?.setData(terrain3D ? objectiveFeatures : { type: 'FeatureCollection', features: [] });
    axisSource?.setData(runtime.tacticalLayers.controlLines ? axisArrowFeatures : { type: 'FeatureCollection', features: [] });
    map.setLayoutProperty('deployment-units', 'text-field', runtime.tacticalLayers.labels ? ['get', 'designation'] : '');
  }, [axisArrowFeatures, clock, mapReady, objectiveFeatures, result, runtime.tacticalLayers.controlLines, runtime.tacticalLayers.labels, runtime.tacticalLayers.routes, tacticalGraphicFeatures, terrain3D]);

  useEffect(() => {
    if (!mapReady || !mapRef.current?.isStyleLoaded()) {
      return;
    }

    mapRef.current.setFilter('deployment-selected-points', ['==', ['get', 'id'], runtime.selectedUnitId]);
    if (terrain3D) {
      mapRef.current.setLayoutProperty('deployment-units', 'icon-size', [
        '*', ['coalesce', ['get', 'symbolScale'], 1],
        ['case', ['==', ['get', 'id'], runtime.selectedUnitId], 1.22, 1],
      ]);
    }
  }, [mapReady, runtime.selectedUnitId, terrain3D]);

  if (runtime.activeTab !== 'map') {
    const label = runtime.activeTab === 'order' ? '명령 계획' : '분석 결과';
    return (
      <section className="flex flex-1 items-center justify-center bg-surface-container-lowest">
        <div className="glass-panel w-[520px] rounded border border-outline-variant p-8 text-center">
          <p className="font-label-caps text-label-caps text-secondary">{label}</p>
          <h2 className="mt-2 font-headline-md text-headline-md text-on-surface">Prototype placeholder</h2>
          <p className="mt-2 font-body-base text-body-base text-on-surface-variant">전술 상황도 탭만 현재 구현되어 있습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex-1 overflow-hidden bg-[#161616]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-surface/15 mix-blend-multiply" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(18,18,18,0.5)_100%)]" />

      <div className="absolute left-6 top-6 z-10 flex items-center gap-2">
        <div className="glass-panel flex h-10 w-10 items-center justify-center rounded border-primary/50 text-primary">
          <Icon name="layers" />
        </div>
        <div className="glass-panel rounded px-3 py-2 font-data-mono text-[11px] text-on-surface-variant">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-secondary" />
          {terrain3D ? 'MAPLIBRE GL 3D TERRAIN' : 'RESULT PLAYBACK MAP'}
        </div>
      </div>

      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90">
          <div className="rounded border border-outline-variant bg-surface-container-high p-6 text-center">
            <p className="font-label-caps text-label-caps text-error">MAP UNAVAILABLE</p>
            <p className="mt-2 font-body-base text-body-base text-on-surface-variant">Unable to load tactical map source.</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-10 rounded border border-outline-variant bg-surface/80 px-2 py-1 font-data-mono text-[9px] text-outline">
        © OpenStreetMap contributors
      </div>
    </section>
  );
}
