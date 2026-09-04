import { GraphicRotationHandle, UnitRotationHandle } from './GraphicRotationHandle';
import { useTaskDrawing } from '../hooks/useTaskDrawing';
import { getTacticalTask, validateTaskPoints, taskLabel } from '../lib/tacticalTasks';
import { useTacticalTaskLayer } from '../hooks/useTacticalTaskLayer';
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

type DrawFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Polygon, { id?: string; type?: TacticalGraphicType; name?: string; tacticalSymbol?: TacticalGraphic['tacticalSymbol'] }>;

const DRAW_MODE_BY_TYPE: Record<Exclude<TacticalGraphicType, 'freehand' | 'mil-task'>, 'draw_line_string' | 'draw_polygon'> = {
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
  'mil-task': 'Tactical Task',
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
        imageId: getMilitarySymbolImageId(unit.sidc, unit.symbolStandard),
        affiliation: unit.affiliation,
        unitType: unit.unitType,
        echelon: unit.echelon,
        symbolScale: unit.symbolScale ?? 1,
        symbolRotation: unit.symbolRotation ?? 0,
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
    features: deployment.tacticalGraphics.filter(g => g.type !== 'mil-task').map((graphic) => ({
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
          properties: { rotation, id: graphic.id },
          geometry: { type: 'Point', coordinates: end },
        };
      }),
  };
}

function nextUnitDesignation(units: DeploymentUnit[], item: Extract<DeploymentPaletteItem, { kind: 'unit' }>) {
  const count = units.filter((unit) => unit.affiliation === item.affiliation && unit.unitType === item.unitType).length + 1;
  const side = item.affiliation === 'friendly' ? 'Friendly' : 'Enemy';
  return `${side} ${item.label.split(' / ').at(-1)} ${count}`;
}

function drawFeatureToGraphic(feature: DrawFeature): TacticalGraphic {
  const type = feature.properties?.type ?? 'route';
  return {
    id: String(feature.id ?? feature.properties?.id ?? `graphic-${crypto.randomUUID()}`),
    type,
    tacticalSymbol: feature.properties?.tacticalSymbol,
    name: feature.properties?.name ?? DEFAULT_GRAPHIC_NAME[type],
    geometry: feature.geometry as TacticalGraphic['geometry'],
  };
}

function graphicToDrawFeature(graphic: TacticalGraphic): DrawFeature {
  return {
    type: 'Feature',
    id: graphic.id,
    properties: { id: graphic.id, type: graphic.type, name: graphic.name, tacticalSymbol: graphic.tacticalSymbol },
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
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [taskEditError, setTaskEditError] = useState('');
  const [rotationId, setRotationId] = useState<string>();
  const [rotationPreview, setRotationPreview] = useState<TacticalGraphic | null>(null);
  const [unitRotationPreview, setUnitRotationPreview] = useState<DeploymentUnit | null>(null);
  const displayDeployment = useMemo(() => ({ ...deployment,
    units: unitRotationPreview ? deployment.units.map(unit => unit.id === unitRotationPreview.id ? unitRotationPreview : unit) : deployment.units,
    tacticalGraphics: rotationPreview ? deployment.tacticalGraphics.map(g => g.id === rotationPreview.id ? rotationPreview : g) : deployment.tacticalGraphics,
  }), [deployment, rotationPreview, unitRotationPreview]);
  const rotationUnit = rotationId && selectedEntityId === rotationId && mode.type === 'select' ? displayDeployment.units.find(unit => unit.id === rotationId) : undefined;
  const rotationGraphic = rotationId && selectedEntityId === rotationId && mode.type === 'select' ? displayDeployment.tacticalGraphics.find(g => g.id === rotationId) : undefined;
  const taskDrawing = useTaskDrawing({ mapRef, ready: isMapReady, mode, deployment, onChange, onModeChange, onSelectEntity });
  const taskRenderError = useTacticalTaskLayer(mapRef, isMapReady, displayDeployment.tacticalGraphics);

  useEffect(() => {
    deploymentRef.current = deployment;
  }, [deployment]);

  useEffect(() => {
    if (mode.type !== 'select' || selectedEntityId !== rotationId || ![...deployment.tacticalGraphics, ...deployment.units].some(g => g.id === rotationId)) {
      setRotationId(undefined); setRotationPreview(null); setUnitRotationPreview(null);
    }
  }, [mode.type, selectedEntityId, rotationId, deployment.tacticalGraphics, deployment.units]);

  const modeLabel = useMemo(() => {
    if (mode.type === 'select') return 'MODE: SELECT / EDIT';
    if (mode.type === 'draw-task') return `MODE: ${getTacticalTask(mode.definitionId)?.label ?? 'TACTICAL TASK'}`;
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
      clickBuffer: 10,
      touchBuffer: 16,
      styles: [
        {
          id: 'atlas-draw-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['any', ['!=', 'user_type', 'mil-task'], ['==', 'active', 'true']]],
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
        await Promise.all(deployment.units.map((unit) => ensureMilitarySymbolImage(map, unit.sidc, unit.symbolStandard)));
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
    void Promise.all(deployment.units.map((unit) => ensureMilitarySymbolImage(mapRef.current!, unit.sidc, unit.symbolStandard))).then(() => {
      (mapRef.current?.getSource(UNIT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toUnitFeatures(displayDeployment));
    });
    (mapRef.current.getSource(OBJECTIVE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toObjectiveFeatures(deployment));
    (mapRef.current.getSource(GRAPHICS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toGraphicFeatureCollection(displayDeployment));
    (mapRef.current.getSource(AXIS_ARROW_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toAxisArrowFeatures(displayDeployment));
  }, [deployment, displayDeployment, isMapReady]);

  useEffect(() => {
    if (!drawRef.current || !isMapReady) return;
    const draw = drawRef.current;
    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: displayDeployment.tacticalGraphics.map(graphicToDrawFeature),
    };
    const signature = JSON.stringify(featureCollection);
    if (signature === lastDrawSignatureRef.current) return;

    isSyncingDrawRef.current = true;
    draw.set(featureCollection);
    lastDrawSignatureRef.current = signature;
    isSyncingDrawRef.current = false;
  }, [displayDeployment.tacticalGraphics, isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    const pointFilter = ['==', ['get', 'id'], selectedEntityId ?? ''] as maplibregl.FilterSpecification;
    mapRef.current.setFilter('deployment-selected-points', pointFilter);
    mapRef.current.setFilter('deployment-selected-lines', pointFilter);
    mapRef.current.setFilter('task-selected-lines', pointFilter);
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
      let drawGraphics: TacticalGraphic[];
      try {
      drawGraphics = draw.getAll().features
        .filter((feature): feature is DrawFeature => feature.geometry.type === 'LineString' || feature.geometry.type === 'Polygon')
        .map(drawFeatureToGraphic);
      for (const g of drawGraphics) {
        if (g.type !== 'mil-task') continue;
        const task = getTacticalTask(g.tacticalSymbol?.definitionId);
        if (!task || g.geometry.type !== 'LineString') throw new Error('전술 도형의 기준점이 유효하지 않습니다.');
        validateTaskPoints(task, g.geometry.coordinates);
      }
      setTaskEditError('');
      } catch (error) {
        setTaskEditError(error instanceof Error ? error.message : String(error));
        draw.set({ type: 'FeatureCollection', features: deploymentRef.current.tacticalGraphics.map(graphicToDrawFeature) });
        return;
      }
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
    const handleDelete = (event: { features: DrawFeature[] }) => {
      const deletedIds = new Set(event.features.map(feature => String(feature.id)));
      const current = deploymentRef.current;
      onChange({ ...current, tacticalGraphics: current.tacticalGraphics.filter(graphic => !deletedIds.has(graphic.id)) });
      onSelectEntity(undefined);
    };
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

      if (mode.type === 'place' || mode.type === 'draw-task') return;
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
  }, [deployment, isMapReady, mode, onChange, onSelectEntity]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (event.target as HTMLElement)?.closest('input,textarea,select')) return;
      setRotationId(undefined); setRotationPreview(null); setUnitRotationPreview(null);
      if (mode.type === 'draw') drawRef.current?.trash();
      else drawRef.current?.changeMode('simple_select');
      onSelectEntity(undefined);
      onModeChange({ type: 'select' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode.type, onModeChange, onSelectEntity]);

  const createDroppedEntity = (item: DeploymentPaletteItem, lng: number, lat: number) => {
    if (item.kind === 'unit') {
      const unit: DeploymentUnit = {
        id: `unit-${crypto.randomUUID()}`,
        designation: nextUnitDesignation(deployment.units, item),
        affiliation: item.affiliation,
        unitType: item.unitType,
        echelon: item.echelon,
        sidc: item.sidc,
        symbolStandard: item.symbolStandard,
        symbolLabel: item.label,
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || mode.type !== 'place') return;
    const handlePlace = (event: maplibregl.MapMouseEvent) => {
      createDroppedEntity(mode.item, event.lngLat.lng, event.lngLat.lat);
      onModeChange({ type: 'select' });
    };
    map.getCanvas().style.cursor = 'crosshair';
    map.on('click', handlePlace);
    return () => {
      map.off('click', handlePlace);
      map.getCanvas().style.cursor = '';
    };
  }, [mode, isMapReady, deployment, onChange, onSelectEntity, onModeChange]);

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
    onModeChange({ type: 'select' });
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

  useEffect(() => {
    const map = mapRef.current;
    if (!isMapReady || !map || (mode.type !== 'select' && mode.type !== 'append-geometry')) return;
    const layers = ['deployment-units', 'deployment-objectives', 'task-lines', 'task-labels', 'deployment-lines', 'deployment-area-line',
      'deployment-axis-arrows', 'deployment-phase-labels', 'task-fill', 'deployment-area-fill'];
    const selectGraphic = (event: maplibregl.MapMouseEvent) => {
      const { x, y } = event.point;
      // The drawn outline often differs from its editable control line. Hit-test
      // rendered geometry with a screen-pixel margin, including arrowheads.
      const exact = map.queryRenderedFeatures(event.point, { layers });
      const nearby = map.queryRenderedFeatures([[x - 10, y - 10], [x + 10, y + 10]], { layers });
      const graphic = [...exact, ...nearby].find(feature =>
        [...deploymentRef.current.units, ...deploymentRef.current.objectives, ...deploymentRef.current.tacticalGraphics].some(item => item.id === feature.properties?.id));
      if (!graphic) {
        setRotationId(undefined); setRotationPreview(null); setUnitRotationPreview(null);
        if (mode.type === 'select') {
          onSelectEntity(undefined);
          drawRef.current?.changeMode('simple_select', { featureIds: [] });
        }
        return;
      }
      event.preventDefault(); // A double-click on a graphic selects it instead of zooming.
      const id = String(graphic.properties!.id);
      if (event.type === 'dblclick') { setRotationId(id); setRotationPreview(null); setUnitRotationPreview(null); }
      onSelectEntity(id);
      onModeChange({ type: 'select' });
      drawRef.current?.changeMode('simple_select', { featureIds: deploymentRef.current.tacticalGraphics.some(item => item.id === id) ? [id] : [] });
    };
    const handleClick = (event: maplibregl.MapMouseEvent) => {
      if (mode.type === 'select') selectGraphic(event);
    };
    map.on('click', handleClick);
    map.on('dblclick', selectGraphic);
    return () => {
      map.off('click', handleClick);
      map.off('dblclick', selectGraphic);
    };
  }, [isMapReady, mode.type, onSelectEntity, onModeChange]);

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
      {rotationUnit && mapRef.current && <UnitRotationHandle map={mapRef.current} graphic={rotationUnit} onPreview={setUnitRotationPreview} onCommit={unit => {
        const current = deploymentRef.current;
        onChange({ ...current, units: current.units.map(item => item.id === unit.id ? { ...item, symbolRotation: unit.symbolRotation } : item) });
        setRotationId(undefined); setRotationPreview(null); setUnitRotationPreview(null);
      }} />}
      {rotationGraphic && mapRef.current && <GraphicRotationHandle map={mapRef.current} graphic={rotationGraphic} onPreview={setRotationPreview} onCommit={graphic => {
        const current = deploymentRef.current;
        onChange({ ...current, tacticalGraphics: current.tacticalGraphics.map(g => g.id === graphic.id ? graphic : g) });
        setRotationId(undefined); setRotationPreview(null); setUnitRotationPreview(null);
      }} />}
      <div className="pointer-events-none absolute inset-0 bg-surface/15 mix-blend-multiply" />
      <div className="absolute left-[var(--map-controls-left)] top-4 z-30 rounded border border-outline-variant bg-surface-container/90 px-3 py-2 font-data-mono text-[11px] text-secondary">
        {modeLabel}
      </div>
      {(taskRenderError || taskEditError) && <p role="alert" className="absolute left-[var(--map-controls-left)] top-20 z-30 max-w-lg bg-surface p-2 text-xs text-error">{taskRenderError || taskEditError}</p>}
      {taskDrawing.task && <div className="absolute left-[var(--map-controls-left)] top-20 z-30 max-w-sm space-y-2 rounded border border-secondary bg-surface p-3 text-xs text-on-surface">
        <p>{taskLabel(taskDrawing.task)}</p><p>기준점 {taskDrawing.count} / {taskDrawing.task.minPoints === taskDrawing.task.maxPoints ? taskDrawing.task.maxPoints : `${taskDrawing.task.minPoints}–${taskDrawing.task.maxPoints}`} · 미리보기 번호 순서대로 클릭</p>
        <div className="flex gap-3"><button disabled={taskDrawing.saving || taskDrawing.count < taskDrawing.task.minPoints} onClick={() => void taskDrawing.finish()} className="text-secondary disabled:opacity-40">완료 (Enter)</button><button disabled={taskDrawing.saving || !taskDrawing.count} onClick={taskDrawing.undo}>마지막 점 취소</button><button onClick={() => onModeChange({ type: 'select' })}>취소 (Esc)</button></div>
        {taskDrawing.saving && <p>도형 생성 중…</p>}{taskDrawing.error && <p role="alert" className="text-error">{taskDrawing.error}</p>}
      </div>}
      <div className="absolute bottom-4 left-[var(--map-controls-left)] z-30 flex gap-2">
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
