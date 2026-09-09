import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Icon } from '../../../components/layout/Icon';
import type { DeploymentSetup, SimulationResult, SimulationRuntimeState, SimulationUnit } from '../../../types';
import { createDefaultMapStyle, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getMapStyleUrl } from '../lib/mapConfig';
import { ensureAxisArrowImage, ensureMilitarySymbolImage, ensureObjectiveImage, getMilitarySymbolImageId } from '../lib/militarySymbolRegistry';
import { getTrackPositionsAtTime } from '../lib/playback';
import { toObservationSectorFeatures } from '../lib/observation';
import { toTacticalGraphicAxisArrowFeatures, toTacticalGraphicFeatureCollection } from '../lib/tacticalGraphics';
import { resolvePlanReference } from '../lib/planReferenceMapping';
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
  units: SimulationUnit[];
  result: SimulationResult;
  deployment?: DeploymentSetup;
  onSelectUnit: (unitId: string) => void;
};

function getMapCenter(result: SimulationResult, deployment?: DeploymentSetup): [number, number] {
  if (deployment?.mapView?.center) {
    return deployment.mapView.center;
  }
  const positions = result.unitTracks.flatMap((track) => track.segments.flatMap((segment) => segment.keyframes.map((keyframe) => keyframe.position)));
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
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const positions = getTrackPositionsAtTime(result, simulationTime);
  const positionedIds = new Set(positions.map(({ unitId }) => unitId));
  const staticPositions = units.flatMap((unit) => (
    !positionedIds.has(unit.id) && unit.geographicPosition
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
            imageId: getMilitarySymbolImageId(sidc, unit.symbolStandard),
            affiliation: unit.allegiance === 'Enemy' ? 'enemy' : 'friendly',
            unitType: unit.type,
            echelon: 'company',
            symbolScale: unit.symbolScale ?? 1,
            symbolRotation: unit.symbolRotation ?? 0,
          },
          geometry: { type: 'Point' as const, coordinates: [position.longitude, position.latitude] },
        },
      ];
    }),
  };
}

function toRouteFeatures(result: SimulationResult): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: result.unitTracks.flatMap((track) =>
      track.segments.map((segment) => ({
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

type ActionEffectFeatureProperties = { kind: 'action-line' | 'action-marker'; color: string; radius: number; action: string };

function toActionEffectFeatures(
  result: SimulationResult,
  simulationTime: number,
  deployment?: DeploymentSetup,
): GeoJSON.FeatureCollection<GeoJSON.Geometry, ActionEffectFeatureProperties> {
  const positions = getTrackPositionsAtTime(result, simulationTime);
  const colorByAction: Record<string, string> = {
    Disrupt: '#ff9f43', 'Establish Security': '#5bd4ff', Report: '#a78bfa', Identify: '#b4c5ff', Confirm: '#b4c5ff', Integrate: '#60a5fa',
    Engage: '#ff5d5d', Decide: '#ffd166', Contain: '#fb923c', Fight: '#ff5d5d', 'Continue to Engage': '#ff7b7b', Breach: '#ffd166',
    Clear: '#5bd4ff', Seize: '#64e7a2', 'Confirm Control': '#64e7a2',
  };
  const features: GeoJSON.Feature<GeoJSON.Geometry, ActionEffectFeatureProperties>[] = [];
  for (const effect of result.actionEffects ?? []) {
    if (effect.startTime > simulationTime || simulationTime >= effect.endTime) continue;
    if (effect.action === 'Move' || effect.action === 'Observe') continue;
    const target = typeof effect.parameters.target === 'string' ? effect.parameters.target
      : typeof effect.parameters.effectArea === 'string' ? effect.parameters.effectArea
        : typeof effect.parameters.result === 'string' ? effect.parameters.result
          : typeof effect.parameters.recipient === 'string' ? effect.parameters.recipient : undefined;
    const color = colorByAction[effect.action];
    if (!color) continue;
    const origin = positions.find((position) => position.unitId === effect.unitId || position.actor === effect.actor)?.position ?? effect.origin;
    const targetPosition = target ? positions.find((position) => position.actor === target)?.position ?? resolvePlanReference(deployment, target) : origin;
    if (!origin || !targetPosition) continue;
    const elapsed = (simulationTime - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime);
    features.push({ type: 'Feature', id: `action-line-${effect.actionSequence}`, properties: { kind: 'action-line', color, radius: 0, action: effect.action }, geometry: { type: 'LineString', coordinates: [[origin.longitude, origin.latitude], [targetPosition.longitude, targetPosition.latitude]] } });
    features.push({ type: 'Feature', id: `action-marker-${effect.actionSequence}`, properties: { kind: 'action-marker', color, radius: 12 + Math.round(elapsed * 16), action: effect.action }, geometry: { type: 'Point', coordinates: [targetPosition.longitude, targetPosition.latitude] } });
  }
  return { type: 'FeatureCollection', features };
}

export function TacticalMap({ runtime, units, result, deployment, onSelectUnit }: TacticalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const mapCenter = useMemo(() => getMapCenter(result, deployment), [deployment, result]);
  const mapZoom = deployment?.mapView?.zoom ?? DEFAULT_MAP_ZOOM + 1;
  const routeFeatures = useMemo(() => toRouteFeatures(result), [result]);
  const tacticalGraphicFeatures = useMemo(() => toTacticalGraphicFeatureCollection(deployment), [deployment]);
  const axisArrowFeatures = useMemo(() => toTacticalGraphicAxisArrowFeatures(deployment), [deployment]);
  const objectiveFeatures = useMemo(() => toObjectiveFeatures(deployment), [deployment]);
  const observationSectorFeatures = useMemo(
    () => toObservationSectorFeatures(result, runtime.simulationTime, deployment),
    [deployment, result, runtime.simulationTime],
  );
  const actionEffectFeatures = useMemo(
    () => toActionEffectFeatures(result, runtime.simulationTime, deployment),
    [deployment, result, runtime.simulationTime],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl() ?? createDefaultMapStyle(),
      center: mapCenter,
      zoom: mapZoom,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const handleLoad = async () => {
      try {
        await ensureObjectiveImage(map);
        await ensureAxisArrowImage(map);
        await Promise.all(units.flatMap((unit) => (unit.sidc ? [ensureMilitarySymbolImage(map, unit.sidc, unit.symbolStandard)] : [])));
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
        onSelectUnit(unitId);
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
  }, [mapCenter, mapZoom, onSelectUnit, units]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const unitSource = mapRef.current.getSource(UNIT_SOURCE_ID) as GeoJSONSource | undefined;
    unitSource?.setData(toUnitFeatures(result, units, runtime.simulationTime));
  }, [mapReady, result, runtime.simulationTime, units]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const observationSource = mapRef.current.getSource(OBSERVATION_SECTOR_SOURCE_ID) as GeoJSONSource | undefined;
    observationSource?.setData(observationSectorFeatures);
  }, [mapReady, observationSectorFeatures]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource(ACTION_EFFECT_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(actionEffectFeatures);
  }, [actionEffectFeatures, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    if (observationSectorFeatures.features.length === 0) {
      map.setPaintProperty('observation-sector-fill', 'fill-opacity', 0.16);
      map.setPaintProperty('observation-sector-outline', 'line-opacity', 0.7);
      return;
    }

    const phase = (Math.sin(runtime.simulationTime * Math.PI / 2) + 1) / 2;
    map.setPaintProperty('observation-sector-fill', 'fill-opacity', 0.18 + phase * 0.16);
    map.setPaintProperty('observation-sector-outline', 'line-opacity', 0.72 + phase * 0.28);
  }, [mapReady, observationSectorFeatures.features.length, runtime.simulationTime]);

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
        ...tacticalGraphicFeatures.features,
        ...(runtime.tacticalLayers.routes ? routeFeatures.features : []),
      ],
    });
    objectiveSource?.setData(objectiveFeatures);
    axisSource?.setData(axisArrowFeatures);
  }, [axisArrowFeatures, mapReady, objectiveFeatures, routeFeatures, runtime.tacticalLayers.routes, tacticalGraphicFeatures]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    mapRef.current.setFilter('deployment-selected-points', ['==', ['get', 'id'], runtime.selectedUnitId]);
  }, [mapReady, runtime.selectedUnitId]);

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
          RESULT PLAYBACK MAP
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
