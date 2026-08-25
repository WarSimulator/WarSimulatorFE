import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type {
  DeploymentEditorMode,
  DeploymentObjective,
  DeploymentPaletteItem,
  DeploymentSetup,
  DeploymentUnit,
  LineStringGeometry,
  TacticalGraphic,
  TacticalGraphicType,
} from '../../../types';
import { createDefaultMapStyle, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getMapStyleUrl } from '../lib/mapConfig';
import { createGeoPosition, getLngLat } from '../lib/position';
import { ensureAxisArrowImage, ensureMilitarySymbolImage, ensureObjectiveImage, getMilitarySymbolImageId } from '../lib/militarySymbolRegistry';
import {
  addDeploymentSourcesAndLayers,
  AXIS_ARROW_SOURCE_ID,
  GRAPHICS_SOURCE_ID,
  OBJECTIVE_SOURCE_ID,
  UNIT_SOURCE_ID,
} from '../lib/tacticalMapLayers';

type DeploymentMapProps = {
  deployment: DeploymentSetup;
  selectedEntityId?: string;
  mode: DeploymentEditorMode;
  onChange: (deployment: DeploymentSetup) => void;
  onSelectEntity: (entityId?: string) => void;
  onModeChange: (mode: DeploymentEditorMode) => void;
};

type DrawFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Polygon, { id?: string; type?: TacticalGraphicType; name?: string }>;

const DRAW_MODE_BY_TYPE: Record<Exclude<TacticalGraphicType, 'freehand'>, 'draw_line_string' | 'draw_polygon'> = {
  route: 'draw_line_string',
  axis: 'draw_line_string',
  'phase-line': 'draw_line_string',
  boundary: 'draw_line_string',
  area: 'draw_polygon',
};

const DEFAULT_GRAPHIC_NAME: Record<TacticalGraphicType, string> = {
  route: 'Route Alpha',
  axis: 'Axis Alpha',
  'phase-line': 'PL RED',
  boundary: 'Boundary Alpha',
  area: 'Area Alpha',
  freehand: 'Freehand Alpha',
};

function patchDrawClasses() {
  const classes = MapboxDraw.constants.classes;
  classes.CANVAS = 'maplibregl-canvas';
  classes.CONTROL_BASE = 'maplibregl-ctrl';
  classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
  classes.CONTROL_GROUP = 'maplibregl-ctrl-group';
  classes.ATTRIBUTION = 'maplibregl-ctrl-attrib';
}

function toUnitFeatures(deployment: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: deployment.units.map((unit) => ({
      type: 'Feature',
      id: unit.id,
      properties: {
        id: unit.id,
        designation: unit.designation,
        sidc: unit.sidc,
        imageId: getMilitarySymbolImageId(unit.sidc),
        affiliation: unit.affiliation,
        unitType: unit.unitType,
        echelon: unit.echelon,
        symbolScale: unit.symbolScale ?? 1,
      },
      geometry: { type: 'Point', coordinates: getLngLat(unit.position) },
    })),
  };
}

function toObjectiveFeatures(deployment: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: deployment.objectives.map((objective) => ({
      type: 'Feature',
      id: objective.id,
      properties: { id: objective.id, name: objective.name, symbolScale: 1 },
      geometry: { type: 'Point', coordinates: getLngLat(objective.position) },
    })),
  };
}

function toGraphicFeatureCollection(deployment: DeploymentSetup): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: deployment.tacticalGraphics.map((graphic) => ({
      type: 'Feature',
      id: graphic.id,
      properties: { id: graphic.id, type: graphic.type, name: graphic.name ?? '' },
      geometry: graphic.geometry,
    })),
  };
}

function toAxisArrowFeatures(deployment: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: deployment.tacticalGraphics
      .filter((graphic) => graphic.type === 'axis' && graphic.geometry.type === 'LineString' && graphic.geometry.coordinates.length > 1)
      .map((graphic) => {
        const coordinates = (graphic.geometry as LineStringGeometry).coordinates;
        const end = coordinates[coordinates.length - 1];
        const prev = coordinates[coordinates.length - 2];
        const rotation = (Math.atan2(-(end[1] - prev[1]), end[0] - prev[0]) * 180) / Math.PI;
        return {
          type: 'Feature',
          id: `${graphic.id}-arrow`,
          properties: { rotation },
          geometry: { type: 'Point', coordinates: end },
        };
      }),
  };
}

function nextUnitDesignation(units: DeploymentUnit[], item: Extract<DeploymentPaletteItem, { kind: 'unit' }>) {
  const count = units.filter((unit) => unit.affiliation === item.affiliation && unit.unitType === item.unitType).length + 1;
  const side = item.affiliation === 'friendly' ? 'Friendly' : 'Enemy';
  return `${side} ${item.label} ${count}`;
}

function drawFeatureToGraphic(feature: DrawFeature): TacticalGraphic {
  const type = feature.properties?.type ?? 'route';
  return {
    id: String(feature.id ?? feature.properties?.id ?? `graphic-${crypto.randomUUID()}`),
    type,
    name: feature.properties?.name ?? DEFAULT_GRAPHIC_NAME[type],
    geometry: feature.geometry as TacticalGraphic['geometry'],
  };
}

function graphicToDrawFeature(graphic: TacticalGraphic): DrawFeature {
  return {
    type: 'Feature',
    id: graphic.id,
    properties: { id: graphic.id, type: graphic.type, name: graphic.name },
    geometry: graphic.geometry,
  };
}

export function DeploymentMap({ deployment, selectedEntityId, mode, onChange, onSelectEntity, onModeChange }: DeploymentMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const deploymentRef = useRef(deployment);
  const isSyncingDrawRef = useRef(false);
  const lastDrawSignatureRef = useRef('');
  const dragUnitIdRef = useRef<string | null>(null);
  const dragObjectiveIdRef = useRef<string | null>(null);
  const freehandGraphicIdRef = useRef<string | null>(null);
  const freehandCoordinatesRef = useRef<[number, number][]>([]);
  const [mapError, setMapError] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    deploymentRef.current = deployment;
  }, [deployment]);

  const modeLabel = useMemo(() => {
    if (mode.type === 'select') return 'MODE: SELECT / EDIT';
    if (mode.type === 'draw') return `MODE: DRAW ${mode.graphicType.toUpperCase()}`;
    if (mode.type === 'append-geometry') return 'MODE: EDIT GEOMETRY';
    return mode.item.kind === 'unit'
      ? `MODE: PLACE ${mode.item.affiliation.toUpperCase()} ${mode.item.label.toUpperCase()}`
      : 'MODE: PLACE OBJECTIVE';
  }, [mode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    patchDrawClasses();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyleUrl() ?? createDefaultMapStyle(),
      center: deployment.mapView?.center ?? DEFAULT_MAP_CENTER,
      zoom: deployment.mapView?.zoom ?? DEFAULT_MAP_ZOOM,
    });
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      userProperties: true,
      styles: [
        {
          id: 'atlas-draw-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString']],
          paint: { 'line-color': '#ffb95f', 'line-width': 2, 'line-dasharray': [2, 2] },
        },
        {
          id: 'atlas-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon']],
          paint: { 'fill-color': '#ffb95f', 'fill-opacity': 0.1 },
        },
        {
          id: 'atlas-draw-polygon-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon']],
          paint: { 'line-color': '#ffb95f', 'line-width': 2 },
        },
        {
          id: 'atlas-draw-points',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point']],
          paint: { 'circle-radius': 4, 'circle-color': '#ffb95f', 'circle-stroke-color': '#121212', 'circle-stroke-width': 1 },
        },
      ],
    });

    mapRef.current = map;
    drawRef.current = draw;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(draw as unknown as maplibregl.IControl, 'top-right');
    map.on('error', () => setMapError(true));
    map.on('load', async () => {
      try {
        await ensureObjectiveImage(map);
        await ensureAxisArrowImage(map);
        await Promise.all(deployment.units.map((unit) => ensureMilitarySymbolImage(map, unit.sidc)));
        addDeploymentSourcesAndLayers(map);
        setIsMapReady(true);
      } catch {
        setMapError(true);
      }
    });
    map.on('moveend', () => {
      const center = map.getCenter();
      onChange({ ...deploymentRef.current, mapView: { center: [center.lng, center.lat], zoom: map.getZoom() } });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    void Promise.all(deployment.units.map((unit) => ensureMilitarySymbolImage(mapRef.current!, unit.sidc))).then(() => {
      (mapRef.current?.getSource(UNIT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toUnitFeatures(deployment));
    });
    (mapRef.current.getSource(OBJECTIVE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toObjectiveFeatures(deployment));
    (mapRef.current.getSource(GRAPHICS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toGraphicFeatureCollection(deployment));
    (mapRef.current.getSource(AXIS_ARROW_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toAxisArrowFeatures(deployment));
  }, [deployment, isMapReady]);

  useEffect(() => {
    if (!drawRef.current || !isMapReady) return;
    const draw = drawRef.current;
    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: deployment.tacticalGraphics.map(graphicToDrawFeature),
    };
    const signature = JSON.stringify(featureCollection);
    if (signature === lastDrawSignatureRef.current) return;

    isSyncingDrawRef.current = true;
    draw.set(featureCollection);
    lastDrawSignatureRef.current = signature;
    isSyncingDrawRef.current = false;
  }, [deployment.tacticalGraphics, isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    const pointFilter = ['==', ['get', 'id'], selectedEntityId ?? ''] as maplibregl.FilterSpecification;
    mapRef.current.setFilter('deployment-selected-points', pointFilter);
    mapRef.current.setFilter('deployment-selected-lines', pointFilter);
  }, [isMapReady, selectedEntityId]);

  useEffect(() => {
    if (!drawRef.current || !mapRef.current || !isMapReady) return;
    const draw = drawRef.current;
    if (mode.type === 'draw' && mode.graphicType !== 'freehand') {
      draw.changeMode(DRAW_MODE_BY_TYPE[mode.graphicType]);
    } else if (mode.type === 'append-geometry') {
      if (!draw.get(mode.graphicId)) {
        const graphic = deployment.tacticalGraphics.find((item) => item.id === mode.graphicId);
        if (graphic) {
          draw.add(graphicToDrawFeature(graphic));
        }
      }
      if (draw.get(mode.graphicId)) {
        draw.changeMode('direct_select', { featureId: mode.graphicId });
      } else {
        draw.changeMode('simple_select');
        onModeChange({ type: 'select' });
      }
    } else if (mode.type === 'select') {
      draw.changeMode('simple_select', selectedEntityId?.startsWith('graphic-') ? { featureIds: [selectedEntityId] } : undefined);
    } else {
      draw.changeMode('simple_select');
    }
  }, [deployment.tacticalGraphics, isMapReady, mode, onModeChange, selectedEntityId]);

  useEffect(() => {
    if (!mapRef.current || !drawRef.current || !isMapReady) return;
    const map = mapRef.current;
    const draw = drawRef.current;

    const syncDraw = () => {
      if (isSyncingDrawRef.current) return;
      const drawGraphics = draw.getAll().features
        .filter((feature): feature is DrawFeature => feature.geometry.type === 'LineString' || feature.geometry.type === 'Polygon')
        .map(drawFeatureToGraphic);
      lastDrawSignatureRef.current = JSON.stringify({ type: 'FeatureCollection', features: drawGraphics.map(graphicToDrawFeature) });
      const drawIds = new Set(drawGraphics.map((graphic) => graphic.id));
      const currentDeployment = deploymentRef.current;
      const untouchedGraphics = currentDeployment.tacticalGraphics.filter((graphic) => !drawIds.has(graphic.id));
      onChange({ ...currentDeployment, tacticalGraphics: [...untouchedGraphics, ...drawGraphics] });
    };

    const handleCreate = (event: { features: DrawFeature[] }) => {
      const feature = event.features[0];
      const oldId = String(feature.id);
      const type = mode.type === 'draw' ? mode.graphicType : 'route';
      const id = `graphic-${crypto.randomUUID()}`;
      feature.id = id;
      feature.properties = { id, type, name: DEFAULT_GRAPHIC_NAME[type] };
      draw.delete(oldId);
      draw.add(feature);
      onSelectEntity(id);
      onModeChange({ type: 'select' });
      syncDraw();
    };
    const handleUpdate = () => syncDraw();
    const handleDelete = () => syncDraw();
    const handleSelection = (event: { features: DrawFeature[] }) => {
      const id = event.features[0]?.properties?.id ?? event.features[0]?.id;
      if (id) onSelectEntity(String(id));
    };

    const drawEventMap = map as unknown as {
      on: (type: string, listener: (event: unknown) => void) => void;
      off: (type: string, listener: (event: unknown) => void) => void;
    };
    drawEventMap.on('draw.create', handleCreate as (event: unknown) => void);
    drawEventMap.on('draw.update', handleUpdate as (event: unknown) => void);
    drawEventMap.on('draw.delete', handleDelete as (event: unknown) => void);
    drawEventMap.on('draw.selectionchange', handleSelection as (event: unknown) => void);
    return () => {
      drawEventMap.off('draw.create', handleCreate as (event: unknown) => void);
      drawEventMap.off('draw.update', handleUpdate as (event: unknown) => void);
      drawEventMap.off('draw.delete', handleDelete as (event: unknown) => void);
      drawEventMap.off('draw.selectionchange', handleSelection as (event: unknown) => void);
    };
  }, [deployment, isMapReady, mode, onChange, onModeChange, onSelectEntity]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    const map = mapRef.current;

    const handleMouseDown = (event: maplibregl.MapMouseEvent) => {
      if (mode.type === 'draw' && mode.graphicType === 'freehand') {
        event.preventDefault();
        map.dragPan.disable();
        const id = `graphic-${crypto.randomUUID()}`;
        const coordinate: [number, number] = [event.lngLat.lng, event.lngLat.lat];
        freehandGraphicIdRef.current = id;
        freehandCoordinatesRef.current = [coordinate];
        const currentDeployment = deploymentRef.current;
        onChange({
          ...currentDeployment,
          tacticalGraphics: [
            ...currentDeployment.tacticalGraphics,
            {
              id,
              type: 'freehand',
              name: DEFAULT_GRAPHIC_NAME.freehand,
              geometry: { type: 'LineString', coordinates: [coordinate] },
            },
          ],
        });
        onSelectEntity(id);
        return;
      }

      const features = map.queryRenderedFeatures(event.point, { layers: ['deployment-units', 'deployment-objectives'] });
      const feature = features[0];
      if (!feature?.properties?.id) return;
      event.preventDefault();
      map.dragPan.disable();
      const id = String(feature.properties.id);
      if (deployment.units.some((unit) => unit.id === id)) dragUnitIdRef.current = id;
      if (deployment.objectives.some((objective) => objective.id === id)) dragObjectiveIdRef.current = id;
      onSelectEntity(id);
    };
    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const unitId = dragUnitIdRef.current;
      const objectiveId = dragObjectiveIdRef.current;
      const freehandGraphicId = freehandGraphicIdRef.current;
      if (freehandGraphicId) {
        const nextCoordinate: [number, number] = [event.lngLat.lng, event.lngLat.lat];
        const previous = freehandCoordinatesRef.current[freehandCoordinatesRef.current.length - 1];
        if (previous && Math.abs(previous[0] - nextCoordinate[0]) < 0.00005 && Math.abs(previous[1] - nextCoordinate[1]) < 0.00005) return;
        freehandCoordinatesRef.current = [...freehandCoordinatesRef.current, nextCoordinate];
        const currentDeployment = deploymentRef.current;
        onChange({
          ...currentDeployment,
          tacticalGraphics: currentDeployment.tacticalGraphics.map((graphic) =>
            graphic.id === freehandGraphicId
              ? { ...graphic, geometry: { type: 'LineString', coordinates: freehandCoordinatesRef.current } }
              : graphic,
          ),
        });
        return;
      }
      if (!unitId && !objectiveId) return;
      const position = createGeoPosition(event.lngLat.lng, event.lngLat.lat);
      if (unitId) {
        const currentDeployment = deploymentRef.current;
        onChange({ ...currentDeployment, units: currentDeployment.units.map((unit) => (unit.id === unitId ? { ...unit, position } : unit)) });
      }
      if (objectiveId) {
        const currentDeployment = deploymentRef.current;
        onChange({ ...currentDeployment, objectives: currentDeployment.objectives.map((objective) => (objective.id === objectiveId ? { ...objective, position } : objective)) });
      }
    };
    const handleMouseUp = () => {
      if (freehandGraphicIdRef.current) {
        freehandGraphicIdRef.current = null;
        freehandCoordinatesRef.current = [];
        onModeChange({ type: 'select' });
      }
      dragUnitIdRef.current = null;
      dragObjectiveIdRef.current = null;
      map.dragPan.enable();
    };

    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);
    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      map.dragPan.enable();
    };
  }, [deployment, isMapReady, onChange, onSelectEntity]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      drawRef.current?.trash();
      onModeChange({ type: 'select' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onModeChange]);

  const createDroppedEntity = (item: DeploymentPaletteItem, lng: number, lat: number) => {
    if (item.kind === 'unit') {
      const unit: DeploymentUnit = {
        id: `unit-${crypto.randomUUID()}`,
        designation: nextUnitDesignation(deployment.units, item),
        affiliation: item.affiliation,
        unitType: item.unitType,
        echelon: item.echelon,
        sidc: item.sidc,
        symbolScale: 1,
        position: createGeoPosition(lng, lat),
      };
      onChange({ ...deployment, units: [...deployment.units, unit] });
      onSelectEntity(unit.id);
      return;
    }
    const objective: DeploymentObjective = {
      id: `objective-${crypto.randomUUID()}`,
      name: `OBJ-${deployment.objectives.length + 1}`,
      position: createGeoPosition(lng, lat),
    };
    onChange({ ...deployment, objectives: [...deployment.objectives, objective] });
    onSelectEntity(objective.id);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!mapRef.current || !mapContainerRef.current) return;
    const raw = event.dataTransfer.getData('application/atlas-palette-item');
    if (!raw) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const point = [event.clientX - rect.left, event.clientY - rect.top] as [number, number];
    const lngLat = mapRef.current.unproject(point);
    createDroppedEntity(JSON.parse(raw) as DeploymentPaletteItem, lngLat.lng, lngLat.lat);
  };

  const deleteSelected = () => {
    if (!selectedEntityId) return;
    drawRef.current?.delete(selectedEntityId);
    onChange({
      ...deployment,
      units: deployment.units.filter((unit) => unit.id !== selectedEntityId),
      objectives: deployment.objectives.filter((objective) => objective.id !== selectedEntityId),
      tacticalGraphics: deployment.tacticalGraphics.filter((graphic) => graphic.id !== selectedEntityId),
    });
    onSelectEntity(undefined);
  };

  const finishDrawing = () => {
    drawRef.current?.changeMode('simple_select');
    onModeChange({ type: 'select' });
  };

  if (mapError) {
    return (
      <section className="flex h-full flex-1 items-center justify-center bg-surface-container-lowest">
        <div className="rounded border border-outline-variant bg-surface-container p-8 text-center">
          <p className="font-label-caps text-label-caps text-error">MAP UNAVAILABLE</p>
          <p className="mt-2 font-body-base text-body-base text-on-surface-variant">Unable to load tactical map source. Deployment data remains available.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative h-full flex-1" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <div ref={mapContainerRef} className="h-full w-full bg-surface-container-lowest" />
      <div className="pointer-events-none absolute inset-0 bg-surface/15 mix-blend-multiply" />
      <div className="absolute left-[268px] top-4 z-30 rounded border border-outline-variant bg-surface-container/90 px-3 py-2 font-data-mono text-[11px] text-secondary">
        {modeLabel}
      </div>
      <div className="absolute bottom-4 left-[268px] z-30 flex gap-2">
        <button className="rounded border border-outline-variant bg-surface-container px-3 py-2 font-data-mono text-[11px] text-on-surface hover:bg-surface-variant" onClick={() => mapRef.current?.zoomIn()}>
          Zoom In
        </button>
        <button className="rounded border border-outline-variant bg-surface-container px-3 py-2 font-data-mono text-[11px] text-on-surface hover:bg-surface-variant" onClick={() => mapRef.current?.zoomOut()}>
          Zoom Out
        </button>
        <button
          className="rounded border border-outline-variant bg-surface-container px-3 py-2 font-data-mono text-[11px] text-on-surface hover:bg-surface-variant"
          onClick={() => mapRef.current?.flyTo({ center: deployment.mapView?.center ?? DEFAULT_MAP_CENTER, zoom: deployment.mapView?.zoom ?? DEFAULT_MAP_ZOOM })}
        >
          Recenter
        </button>
        {mode.type === 'draw' && (
          <button className="rounded border border-secondary bg-secondary/10 px-3 py-2 font-data-mono text-[11px] text-secondary hover:bg-secondary/20" onClick={finishDrawing}>
            Finish
          </button>
        )}
        <button
          className="rounded border border-error/60 bg-surface-container px-3 py-2 font-data-mono text-[11px] text-error disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!selectedEntityId}
          onClick={deleteSelected}
        >
          Delete Selected
        </button>
      </div>
    </section>
  );
}
