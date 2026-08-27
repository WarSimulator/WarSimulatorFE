import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Icon } from '../../../components/layout/Icon';
import type { SimulationResult, SimulationRuntimeState, SimulationUnit } from '../../../types';
import { createDefaultMapStyle, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getMapStyleUrl } from '../lib/mapConfig';
import { ensureAxisArrowImage, ensureMilitarySymbolImage, ensureObjectiveImage, getMilitarySymbolImageId } from '../lib/militarySymbolRegistry';
import { getTrackPositionsAtTime } from '../lib/playback';
import { toObservationSectorFeatures } from '../lib/observation';
import {
  addDeploymentSourcesAndLayers,
  AXIS_ARROW_SOURCE_ID,
  GRAPHICS_SOURCE_ID,
  OBJECTIVE_SOURCE_ID,
  OBSERVATION_SECTOR_SOURCE_ID,
  UNIT_SOURCE_ID,
} from '../lib/tacticalMapLayers';

type TacticalMapProps = {
  runtime: SimulationRuntimeState;
  units: SimulationUnit[];
  result: SimulationResult;
  onSelectUnit: (unitId: string) => void;
};

function getMapCenter(result: SimulationResult): [number, number] {
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

  return {
    type: 'FeatureCollection',
    features: positions.flatMap(({ unitId, actor, position }) => {
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
            imageId: getMilitarySymbolImageId(sidc),
            affiliation: 'friendly',
            unitType: unit.type,
            echelon: 'company',
            symbolScale: unit.symbolScale ?? 1,
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

export function TacticalMap({ runtime, units, result, onSelectUnit }: TacticalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const mapCenter = useMemo(() => getMapCenter(result), [result]);
  const routeFeatures = useMemo(() => toRouteFeatures(result), [result]);
  const observationSectorFeatures = useMemo(
    () => toObservationSectorFeatures(result, runtime.simulationTime),
    [result, runtime.simulationTime],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl() ?? createDefaultMapStyle(),
      center: mapCenter,
      zoom: DEFAULT_MAP_ZOOM + 1,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const handleLoad = async () => {
      try {
        await ensureObjectiveImage(map);
        await ensureAxisArrowImage(map);
        await Promise.all(units.flatMap((unit) => (unit.sidc ? [ensureMilitarySymbolImage(map, unit.sidc)] : [])));
        addDeploymentSourcesAndLayers(map);
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
  }, [mapCenter, onSelectUnit, units]);

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
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    if (observationSectorFeatures.features.length === 0) {
      map.setPaintProperty('observation-sector-fill', 'fill-opacity', 0.08);
      map.setPaintProperty('observation-sector-outline', 'line-opacity', 0.5);
      return;
    }

    let animationFrameId = 0;
    const pulse = (timestamp: number) => {
      const phase = (Math.sin((timestamp / 1_400) * Math.PI * 2) + 1) / 2;
      map.setPaintProperty('observation-sector-fill', 'fill-opacity', 0.08 + phase * 0.12);
      map.setPaintProperty('observation-sector-outline', 'line-opacity', 0.45 + phase * 0.25);
      animationFrameId = window.requestAnimationFrame(pulse);
    };

    animationFrameId = window.requestAnimationFrame(pulse);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [mapReady, observationSectorFeatures.features.length]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const graphicsSource = map.getSource(GRAPHICS_SOURCE_ID) as GeoJSONSource | undefined;
    const objectiveSource = map.getSource(OBJECTIVE_SOURCE_ID) as GeoJSONSource | undefined;
    const axisSource = map.getSource(AXIS_ARROW_SOURCE_ID) as GeoJSONSource | undefined;

    graphicsSource?.setData(runtime.tacticalLayers.routes ? routeFeatures : { type: 'FeatureCollection', features: [] });
    objectiveSource?.setData({ type: 'FeatureCollection', features: [] });
    axisSource?.setData({ type: 'FeatureCollection', features: [] });
  }, [mapReady, routeFeatures, runtime.tacticalLayers.routes]);

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
