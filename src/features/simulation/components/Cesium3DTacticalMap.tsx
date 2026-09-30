import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BillboardGraphics,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  createOsmBuildingsAsync,
  CustomDataSource,
  EllipsoidTerrainProvider,
  Entity,
  HeadingPitchRange,
  HeightReference,
  HorizontalOrigin,
  Ion,
  IonImageryProvider,
  JulianDate,
  LabelStyle,
  Matrix4,
  Math as CesiumMath,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  PolygonHierarchy,
  PolylineArrowMaterialProperty,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SceneMode,
  Terrain,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { AtomicActionEffect, DeploymentSetup, DeploymentUnit, SimulationResult, SimulationResultPosition, SimulationRuntimeState, SimulationUnit, TacticalGraphic } from '../../../types';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { graphicColor } from '../lib/graphicColor';
import { getLngLat } from '../lib/position';
import { getTrackPositionsAtTime, getUnitPositionAtTime, isUnitEliminated } from '../lib/playback';
import { buildObservationSector, getActiveObservationEffects } from '../lib/observation';
import { resolvePlanReference } from '../lib/planReferenceMapping';
import { scannerVisualForAffiliation } from '../lib/scannerVisual';
import { createMilitarySymbolSvg, get3DUnitSymbolSize } from '../lib/symbolSvg';
import { createTaskGraphic, getTacticalTask } from '../lib/tacticalTasks';
import type { LiveEdit, Position3D } from './Google3DTacticalMap';
import { SymbolPalette } from './SymbolPalette';
import { UnitPropertiesPanel } from './UnitPropertiesPanel';

type Props = {
  runtime: SimulationRuntimeState;
  playbackRef?: { current: SimulationRuntimeState };
  units: SimulationUnit[];
  result: SimulationResult;
  deployment?: DeploymentSetup;
  onSelectUnit: (unitId: string) => void;
  atomicActionVisuals?: boolean;
  liveEdit?: LiveEdit;
};

const LIVE_GRAPHIC_NAMES = {
  route: 'Route Alpha', axis: 'Axis Alpha', 'phase-line': 'PL RED', boundary: 'Boundary Alpha', area: 'Area Alpha', freehand: 'Freehand Alpha',
} as const;
const FREEHAND_SAMPLE_PIXELS = 6;

const FIRE_ACTIONS = new Set(['Engage', 'Continue to Engage', 'Fight', 'Ambush', 'Disrupt', 'Destroy']);
const AREA_ACTIONS = new Set(['Establish Security', 'Establish Presence', 'Confirm Control', 'Contain', 'Block', 'Clear', 'Seize']);
const ACTION_COLORS: Record<string, string> = {
  Move: '#ffb95f', Observe: '#66d9ff', Engage: '#ff5d5d', 'Continue to Engage': '#ff7b7b',
  'Establish Security': '#5bd4ff', 'Establish Presence': '#5bd4ff', Confirm: '#b4c5ff',
  'Confirm Control': '#64e7a2', Construct: '#ffd166', Adapt: '#c084fc', Decide: '#ffd166',
  'Re-Orient': '#c084fc', Adjust: '#c084fc', Demonstrate: '#fb923c', Integrate: '#60a5fa',
  Contain: '#fb923c', Block: '#fb923c', Report: '#a78bfa', Identify: '#b4c5ff',
  Fight: '#ff5d5d', Withdraw: '#a78bfa', 'Do not seek a decisive engagement': '#a78bfa',
  'Disassemble / Disarm': '#64e7a2', Ambush: '#ff5d5d', Breach: '#ffd166', Clear: '#5bd4ff',
  Seize: '#64e7a2', Disrupt: '#ff9f43', Destroy: '#ff5d5d',
};

function cssColor(value: string, alpha = 1) {
  return Color.fromCssColorString(value).withAlpha(alpha);
}

async function symbolCanvas(unit: Pick<SimulationUnit, 'sidc' | 'icon' | 'symbolScale' | 'symbolStandard'> | Pick<DeploymentUnit, 'sidc' | 'symbolScale' | 'symbolStandard'>) {
  const size = get3DUnitSymbolSize(unit.symbolScale);
  const sidc = 'icon' in unit ? unit.sidc ?? unit.icon : unit.sidc;
  const svg = createMilitarySymbolSvg(sidc, size, undefined, unit.symbolStandard);
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('군대부호 캔버스를 만들지 못했습니다.');
    const scale = Math.min(116 / Math.max(1, image.naturalWidth), 116 / Math.max(1, image.naturalHeight));
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function getCenter(result: SimulationResult, deployment?: DeploymentSetup) {
  const configured = deployment?.mapView?.center;
  if (configured) return { longitude: configured[0], latitude: configured[1] };
  const positions = result.unitTracks.flatMap(track => track.segments.flatMap(segment => segment.keyframes.map(frame => frame.position)));
  if (!positions.length) return { longitude: DEFAULT_MAP_CENTER[0], latitude: DEFAULT_MAP_CENTER[1] };
  return {
    longitude: positions.reduce((sum, position) => sum + position.longitude, 0) / positions.length,
    latitude: positions.reduce((sum, position) => sum + position.latitude, 0) / positions.length,
  };
}

function getCameraRange(result: SimulationResult, center: SimulationResultPosition) {
  const positions = result.unitTracks.flatMap(track => track.segments.flatMap(segment => segment.keyframes.map(frame => frame.position)));
  const farthest = positions.reduce((maximum, position) => {
    const latitudeMeters = (position.latitude - center.latitude) * 111_000;
    const longitudeMeters = (position.longitude - center.longitude) * 111_000 * Math.cos(center.latitude * Math.PI / 180);
    return Math.max(maximum, Math.hypot(latitudeMeters, longitudeMeters));
  }, 0);
  return Math.max(2_000, Math.min(35_000, farthest * 3));
}

function positionsAtTime(result: SimulationResult, units: SimulationUnit[], time: number) {
  const moving = getTrackPositionsAtTime(result, time);
  const movingIds = new Set(moving.map(item => item.unitId));
  return [
    ...moving.flatMap(item => item.position ? [{ ...item, position: item.position }] : []),
    ...units.flatMap(unit => !movingIds.has(unit.id) && !isUnitEliminated(result, unit.id, time) && unit.geographicPosition
      ? [{ unitId: unit.id, actor: unit.name, position: unit.geographicPosition }]
      : []),
  ];
}

function actionTarget(effect: Pick<AtomicActionEffect, 'parameters'>, result: SimulationResult, deployment: DeploymentSetup | undefined, time: number) {
  const reference = [effect.parameters.target, effect.parameters.destination, effect.parameters.recipient, effect.parameters.effectArea, effect.parameters.result]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return reference ? getUnitPositionAtTime(reference, time, result, deployment) ?? resolvePlanReference(deployment, reference) : undefined;
}

function actionArea(effect: AtomicActionEffect, deployment?: DeploymentSetup) {
  const reference = effect.parameters.target ?? effect.parameters.effectArea;
  if (typeof reference !== 'string') return undefined;
  const graphic = deployment?.tacticalGraphics.find(item => item.id === reference || item.name === reference);
  return graphic?.geometry.type === 'Polygon' ? graphic.geometry.coordinates[0] : undefined;
}

function tacticalPositions(graphic: TacticalGraphic) {
  return graphic.geometry.type === 'LineString' ? graphic.geometry.coordinates : graphic.geometry.coordinates[0];
}

/** Adds a stable, open arrowhead to the final Axis segment. */
function axisDisplayCoordinates(coordinates: number[][]) {
  if (coordinates.length < 2) return coordinates;
  const tip = coordinates.at(-1)!;
  const previous = coordinates.at(-2)!;
  const longitudeScale = Math.max(0.01, Math.cos(tip[1] * Math.PI / 180));
  const dx = (tip[0] - previous[0]) * longitudeScale;
  const dy = tip[1] - previous[1];
  const length = Math.hypot(dx, dy);
  if (!length) return coordinates;
  const arrowLength = Math.min(length * 0.38, 0.006);
  const backX = -dx / length;
  const backY = -dy / length;
  const wing = (side: number) => [
    tip[0] + (backX - side * backY * 0.62) * arrowLength / longitudeScale,
    tip[1] + (backY + side * backX * 0.62) * arrowLength,
  ];
  return [...coordinates, wing(1), tip, wing(-1)];
}

function graphicLineMaterial(graphic: TacticalGraphic, color: Color) {
  return graphic.type === 'boundary'
    ? new PolylineDashMaterialProperty({ color, dashLength: 20 })
    : color;
}

function graphicLabel(graphic: TacticalGraphic, coordinates: number[][], color: Color) {
  if (graphic.type !== 'phase-line' || !coordinates.length) return {};
  const point = coordinates[Math.floor((coordinates.length - 1) / 2)];
  return {
    position: Cartesian3.fromDegrees(point[0], point[1], 7),
    label: {
      text: graphic.name ?? 'PHASE LINE', font: '700 13px sans-serif', fillColor: color,
      outlineColor: Color.BLACK, outlineWidth: 4, style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -12), heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  };
}

function addStaticLayers(source: CustomDataSource, result: SimulationResult, deployment?: DeploymentSetup) {
  for (const track of result.unitTracks) {
    for (const segment of track.segments) {
      const coordinates = segment.keyframes.map(frame => frame.position).filter((position, index, all) => index === 0 || position.longitude !== all[index - 1].longitude || position.latitude !== all[index - 1].latitude);
      if (coordinates.length < 2) continue;
      source.entities.add({
        id: `route:${track.unitId}:${segment.actionSequence}`,
        properties: { layer: 'route', startTime: segment.startTime, endTime: segment.endTime },
        polyline: {
          positions: coordinates.map(position => Cartesian3.fromDegrees(position.longitude, position.latitude, 4)),
          width: 4,
          clampToGround: true,
          material: new PolylineArrowMaterialProperty(cssColor(segment.action === 'Withdraw' ? '#a78bfa' : '#ffb95f', 0.9)),
        },
      });
    }
  }
  for (const graphic of deployment?.tacticalGraphics ?? []) {
    const coordinates = tacticalPositions(graphic);
    if (coordinates.length < 1) continue;
    const color = cssColor(graphicColor(graphic));
    if (graphic.geometry.type === 'Polygon') {
      source.entities.add({
        id: `graphic:${graphic.id}`,
        properties: { layer: 'control' },
        polygon: { hierarchy: new PolygonHierarchy(coordinates.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat))), material: color.withAlpha(0.1), outline: true, outlineColor: color, heightReference: HeightReference.CLAMP_TO_GROUND },
      });
    } else if (coordinates.length >= 2) {
      const displayCoordinates = graphic.type === 'axis' ? axisDisplayCoordinates(coordinates) : coordinates;
      source.entities.add({
        id: `graphic:${graphic.id}`,
        properties: { layer: 'control' },
        polyline: { positions: displayCoordinates.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 3)), width: graphic.type === 'axis' ? 6 : 4, clampToGround: true, material: graphicLineMaterial(graphic, color) },
        ...graphicLabel(graphic, coordinates, color),
      });
    }
  }
  for (const objective of deployment?.objectives ?? []) {
    const [lng, lat] = getLngLat(objective.position);
    source.entities.add({
      id: `objective:${objective.id}`,
      properties: { layer: 'control' },
      position: Cartesian3.fromDegrees(lng, lat, 5),
      point: { color: cssColor('#80d8ff'), pixelSize: 11, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: `OBJ · ${objective.name}`, font: '700 13px sans-serif', fillColor: cssColor('#80d8ff'), outlineColor: Color.BLACK, outlineWidth: 4, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, -22), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
  }
}

function updateActions(source: CustomDataSource, result: SimulationResult, deployment: DeploymentSetup | undefined, time: number, atomicActionVisuals: boolean) {
  const activeEntityIds = new Set<string>();
  const upsertEntity = (options: Entity.ConstructorOptions) => {
    if (!options.id) return;
    activeEntityIds.add(options.id);
    const existing = source.entities.getById(options.id);
    if (!existing) {
      source.entities.add(options);
      return;
    }

    // Keep the Entity in the collection and only replace its visual properties.
    // Removing and re-adding an active polyline makes Cesium drop its primitive
    // for a rendered frame, which was visible as a flashing Engage line.
    const updated = new Entity(options);
    const now = JulianDate.now();
    const existingPosition = existing.position?.getValue(now);
    const updatedPosition = updated.position?.getValue(now);
    if ((!existingPosition && updatedPosition) || (existingPosition && !updatedPosition)
      || (existingPosition && updatedPosition && !Cartesian3.equals(existingPosition, updatedPosition))) {
      existing.position = updated.position;
    }
    existing.billboard = updated.billboard;
    if (existing.ellipse && updated.ellipse) {
      existing.ellipse.semiMajorAxis = updated.ellipse.semiMajorAxis;
      existing.ellipse.semiMinorAxis = updated.ellipse.semiMinorAxis;
      existing.ellipse.material = updated.ellipse.material;
      existing.ellipse.outline = updated.ellipse.outline;
      existing.ellipse.outlineColor = updated.ellipse.outlineColor;
      existing.ellipse.heightReference = updated.ellipse.heightReference;
      existing.ellipse.show = updated.ellipse.show;
    } else {
      existing.ellipse = updated.ellipse;
    }
    if (existing.polygon && updated.polygon) {
      // Observation sectors change direction while scanning. Keep the same
      // PolygonGraphics object and update its properties, matching the retained
      // overlay approach used by the Google 3D visualization.
      existing.polygon.hierarchy = updated.polygon.hierarchy;
      existing.polygon.material = updated.polygon.material;
      existing.polygon.outline = updated.polygon.outline;
      existing.polygon.outlineColor = updated.polygon.outlineColor;
      existing.polygon.heightReference = updated.polygon.heightReference;
      existing.polygon.perPositionHeight = updated.polygon.perPositionHeight;
      existing.polygon.show = updated.polygon.show;
    } else {
      existing.polygon = updated.polygon;
    }
    if (existing.polyline && updated.polyline) {
      // Preserve the PolylineGraphics instance as well. Swapping the whole
      // object can make Cesium rebuild its primitive even though the Entity
      // itself survived, producing the same one-frame flash on some GPUs.
      existing.polyline.positions = updated.polyline.positions;
      existing.polyline.width = updated.polyline.width;
      existing.polyline.material = updated.polyline.material;
      existing.polyline.clampToGround = updated.polyline.clampToGround;
      existing.polyline.show = updated.polyline.show;
    } else {
      existing.polyline = updated.polyline;
    }
    existing.show = true;
  };
  const addDirected = (key: string, action: string, origin: SimulationResultPosition, target?: SimulationResultPosition, progress = 0) => {
    const color = cssColor(ACTION_COLORS[action] ?? '#f8c66d');
    const pulse = target ?? origin;
    const fire = FIRE_ACTIONS.has(action);
    if (target && (target.longitude !== origin.longitude || target.latitude !== origin.latitude)) {
      const altitude = fire ? 80 : 8;
      upsertEntity({ id: `${key}:line`, polyline: { positions: [Cartesian3.fromDegrees(origin.longitude, origin.latitude, altitude), Cartesian3.fromDegrees(target.longitude, target.latitude, altitude)], width: fire ? 7 : 5, material: color, clampToGround: !fire } });
    }
    const radius = (FIRE_ACTIONS.has(action) ? 115 : action === 'Observe' ? 160 : 105) * (0.75 + 0.3 * Math.sin(progress * Math.PI * 2));
    upsertEntity({ id: `${key}:pulse`, position: Cartesian3.fromDegrees(pulse.longitude, pulse.latitude, 3), ellipse: { semiMajorAxis: radius, semiMinorAxis: radius, material: color.withAlpha(0.18), outline: true, outlineColor: color, heightReference: HeightReference.CLAMP_TO_GROUND } });
    if (fire && target) {
      const frame = Math.floor(progress * 64) % 32;
      upsertEntity({ id: `${key}:vfx`, position: Cartesian3.fromDegrees(target.longitude, target.latitude, 10), billboard: { image: `/vfx/frames/explosion/frame-${String(frame).padStart(2, '0')}.png`, width: 112, height: 112, verticalOrigin: VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    }
  };

  for (const observation of getActiveObservationEffects(result, time)) {
    const origin = getUnitPositionAtTime(observation.actor, time, result, deployment) ?? observation.origin;
    const affiliation = deployment?.units.find(unit => unit.id === observation.actor || unit.designation === observation.actor)?.affiliation;
    const visual = scannerVisualForAffiliation(affiliation);
    const sector = buildObservationSector({ ...observation, origin, direction: observation.direction + Math.sin((time - observation.startTime) * Math.PI / 2) * observation.fovDegrees * 0.1 }).geometry.coordinates[0];
    upsertEntity({
      id: `observe:${observation.actionSequence}`,
      polygon: {
        hierarchy: new PolygonHierarchy(sector.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, visual.altitudeOffsetMeters))),
        material: cssColor(visual.fillColor, visual.fillOpacity),
        outline: false,
        perPositionHeight: true,
      },
    });
  }
  for (const effect of result.actionEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime || (atomicActionVisuals && ['Move', 'Withdraw', 'Observe'].includes(effect.action))) continue;
    const origin = getUnitPositionAtTime(effect.unitId, time, result, deployment) ?? getUnitPositionAtTime(effect.actor, time, result, deployment) ?? effect.origin;
    const target = actionTarget(effect, result, deployment, time);
    const progress = Math.max(0, Math.min(1, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime)));
    const area = atomicActionVisuals && AREA_ACTIONS.has(effect.action) ? actionArea(effect, deployment) : undefined;
    if (area && area.length >= 3) {
      const color = cssColor(ACTION_COLORS[effect.action] ?? '#f8c66d');
      upsertEntity({ id: `action:${effect.actionSequence}:area`, polygon: { hierarchy: new PolygonHierarchy(area.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat))), material: color.withAlpha(0.05 + progress * 0.16), outline: true, outlineColor: color, heightReference: HeightReference.CLAMP_TO_GROUND } });
    } else addDirected(`action:${effect.actionSequence}`, effect.action, origin, target, progress);
  }
  for (const effect of result.engagementEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime) continue;
    const origin = getUnitPositionAtTime(effect.actor, time, result, deployment);
    const target = getUnitPositionAtTime(effect.target, time, result, deployment) ?? resolvePlanReference(deployment, effect.target);
    if (origin) addDirected(`engage:${effect.actionSequence}`, effect.action, origin, target, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime));
  }
  for (const entity of [...source.entities.values]) {
    if (!activeEntityIds.has(entity.id)) source.entities.remove(entity);
  }
}

export function Cesium3DTacticalMap({ runtime, playbackRef, units, result, deployment, onSelectUnit, atomicActionVisuals = false, liveEdit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | undefined>(undefined);
  const unitEntitiesRef = useRef(new Map<string, Entity>());
  const staticSourceRef = useRef<CustomDataSource | undefined>(undefined);
  const actionSourceRef = useRef<CustomDataSource | undefined>(undefined);
  const liveSourceRef = useRef<CustomDataSource | undefined>(undefined);
  const liveEditRef = useRef(liveEdit);
  const fallbackPlaybackRef = useRef(runtime);
  const drawPointsRef = useRef<[number, number][]>([]);
  const axisSourceUnitIdRef = useRef<string | undefined>(undefined);
  const editingVertexRef = useRef<number | undefined>(undefined);
  const freehandPointerRef = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const finishDrawingRef = useRef<() => void>(() => {});
  const [drawPointCount, setDrawPointCount] = useState(0);
  const [editingVertex, setEditingVertex] = useState<number>();
  const [graphicError, setGraphicError] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const clock = playbackRef ?? fallbackPlaybackRef;
  const center = useMemo(() => getCenter(result, deployment), [deployment, result]);
  const cameraRange = useMemo(() => getCameraRange(result, center), [center, result]);
  const editingEnabled = Boolean(liveEdit && liveEdit.editingEnabled !== false);
  useEffect(() => { fallbackPlaybackRef.current = runtime; }, [runtime]);
  useEffect(() => { liveEditRef.current = liveEdit; }, [liveEdit]);
  useEffect(() => {
    drawPointsRef.current = [];
    axisSourceUnitIdRef.current = undefined;
    editingVertexRef.current = undefined;
    freehandPointerRef.current = undefined;
    setDrawPointCount(0);
    setEditingVertex(undefined);
    setGraphicError('');
  }, [liveEdit?.mode]);

  const finishDrawing = () => {
    const editor = liveEditRef.current;
    const points = drawPointsRef.current;
    if (!editor) return;
    let graphic: TacticalGraphic | undefined;
    try {
      if (editor.mode.type === 'draw-task') {
        const task = getTacticalTask(editor.mode.definitionId);
        if (task && points.length >= task.minPoints && points.length <= task.maxPoints) graphic = createTaskGraphic(task, editor.mode.affiliation, points);
      } else if (editor.mode.type === 'draw' && points.length >= (editor.mode.graphicType === 'area' ? 3 : 2)) {
        const graphicPoints = editor.mode.graphicType === 'axis' ? [points[0], points.at(-1)!] : points;
        graphic = {
          id: `graphic-${crypto.randomUUID()}`,
          type: editor.mode.graphicType,
          name: LIVE_GRAPHIC_NAMES[editor.mode.graphicType],
          ...(editor.mode.graphicType === 'axis' && axisSourceUnitIdRef.current ? { sourceUnitId: axisSourceUnitIdRef.current } : {}),
          geometry: editor.mode.graphicType === 'area'
            ? { type: 'Polygon', coordinates: [[...points, points[0]]] }
            : { type: 'LineString', coordinates: graphicPoints },
        };
      }
    } catch (caught) {
      setGraphicError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    if (graphic) editor.onAddGraphic(graphic);
  };
  finishDrawingRef.current = finishDrawing;

  const screenPosition = (clientX: number, clientY: number): Position3D | undefined => {
    const viewer = viewerRef.current;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!viewer || !bounds) return undefined;
    const pixel = new Cartesian2(clientX - bounds.left, clientY - bounds.top);
    const ray = viewer.camera.getPickRay(pixel);
    const cartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : viewer.camera.pickEllipsoid(pixel, viewer.scene.globe.ellipsoid);
    if (!cartesian) return undefined;
    const coordinate = Cartographic.fromCartesian(cartesian);
    return { lng: CesiumMath.toDegrees(coordinate.longitude), lat: CesiumMath.toDegrees(coordinate.latitude) };
  };

  const addFreehandPoint = (clientX: number, clientY: number) => {
    const position = screenPosition(clientX, clientY);
    if (!position) return;
    drawPointsRef.current = [...drawPointsRef.current, [position.lng, position.lat]];
    setDrawPointCount(drawPointsRef.current.length);
  };
  const beginFreehand = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drawPointsRef.current = [];
    setDrawPointCount(0);
    freehandPointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    addFreehandPoint(event.clientX, event.clientY);
  };
  const continueFreehand = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = freehandPointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) < FREEHAND_SAMPLE_PIXELS) return;
    active.x = event.clientX; active.y = event.clientY;
    addFreehandPoint(event.clientX, event.clientY);
  };
  const endFreehand = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (freehandPointerRef.current?.id !== event.pointerId) return;
    event.preventDefault();
    freehandPointerRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrawingRef.current();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let viewer: Viewer | undefined;
    const initialize = async () => {
      try {
        const unitSymbols = new Map(await Promise.all(units.map(async unit => [unit.id, await symbolCanvas(unit)] as const)));
        if (cancelled) return;
        const token = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim();
        if (token) Ion.defaultAccessToken = token;
        const imageryProvider = token
          ? await IonImageryProvider.fromAssetId(2)
          : new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
        if (cancelled) return;
        viewer = new Viewer(container, {
          baseLayer: false,
          terrain: token ? Terrain.fromWorldTerrain() : undefined,
          terrainProvider: token ? undefined : new EllipsoidTerrainProvider(),
          sceneMode: SceneMode.SCENE3D,
          scene3DOnly: true,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
        });
        viewer.imageryLayers.addImageryProvider(imageryProvider);
        viewerRef.current = viewer;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.showGroundAtmosphere = true;
        // Slight vertical emphasis makes ridgelines and valleys legible at the
        // wide operational camera range without distorting unit coordinates.
        viewer.scene.verticalExaggeration = token ? 1.35 : 1;
        viewer.scene.backgroundColor = cssColor('#101418');
        if (token) {
          try {
            const buildings = await createOsmBuildingsAsync();
            if (cancelled) {
              buildings.destroy();
              return;
            }
            viewer.scene.primitives.add(buildings);
          } catch {
            // Terrain remains fully usable if the optional ion building layer
            // is unavailable for this token or geographic area.
          }
        }
        const staticSource = new CustomDataSource('static-tactical-layers');
        const actionSource = new CustomDataSource('atomic-action-effects');
        const liveSource = new CustomDataSource('live-edit');
        viewer.dataSources.add(staticSource);
        viewer.dataSources.add(actionSource);
        viewer.dataSources.add(liveSource);
        staticSourceRef.current = staticSource;
        actionSourceRef.current = actionSource;
        liveSourceRef.current = liveSource;
        addStaticLayers(staticSource, result, deployment);
        for (const unit of units) {
          const position = unit.geographicPosition ?? getUnitPositionAtTime(unit.id, result.startTime, result, deployment);
          if (!position) continue;
          const size = get3DUnitSymbolSize(unit.symbolScale);
          const entity = viewer.entities.add({
            id: `unit:${unit.id}`,
            position: Cartesian3.fromDegrees(position.longitude, position.latitude, 10),
            billboard: new BillboardGraphics({ image: unitSymbols.get(unit.id), width: size * 2.4, height: size * 2.4, verticalOrigin: VerticalOrigin.BOTTOM, horizontalOrigin: HorizontalOrigin.CENTER, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new NearFarScalar(500, 1.15, 60_000, 0.72) }),
            label: { text: unit.name, font: '700 13px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, 10), verticalOrigin: VerticalOrigin.TOP, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          });
          unitEntitiesRef.current.set(unit.id, entity);
        }
        viewer.camera.lookAt(Cartesian3.fromDegrees(center.longitude, center.latitude), new HeadingPitchRange(CesiumMath.toRadians(-12), CesiumMath.toRadians(-34), cameraRange * 0.88));
        // `lookAt` leaves the camera in a local frame centred on the operation
        // area. Preserve the initial view, then restore Cesium's world frame so
        // normal pan/orbit/zoom input is not constrained to that fixed target.
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        setReady(true);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'CesiumJS 지도를 초기화하지 못했습니다.');
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      unitEntitiesRef.current.clear();
      staticSourceRef.current = undefined;
      actionSourceRef.current = undefined;
      liveSourceRef.current = undefined;
      viewerRef.current = undefined;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [cameraRange, center, deployment, onSelectUnit, result, units]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const editor = liveEditRef.current;
      const picked = viewer.scene.pick(movement.position) as { id?: Entity } | undefined;
      const entityId = typeof picked?.id?.id === 'string' ? picked.id.id : '';
      const liveId = entityId.startsWith('live-unit:') ? entityId.slice(10)
        : entityId.startsWith('live-objective:') ? entityId.slice(15)
          : entityId.startsWith('live-graphic:') ? entityId.slice(13)
            : undefined;
      const baseUnitId = entityId.startsWith('unit:') ? entityId.slice(5) : undefined;
      if (!editor || editor.editingEnabled === false) {
        if (baseUnitId) onSelectUnit(baseUnitId);
        return;
      }
      if (entityId.startsWith('live-vertex:')) {
        const index = Number(entityId.slice(12));
        editingVertexRef.current = index;
        setEditingVertex(index);
        return;
      }
      if (editor.mode.type === 'draw' && editor.mode.graphicType === 'axis' && drawPointsRef.current.length === 0 && (liveId || baseUnitId)) {
        const unitId = liveId ?? baseUnitId!;
        const edited = editor.units.find(unit => unit.id === unitId);
        const simulationPosition = edited ? undefined : getUnitPositionAtTime(unitId, clock.current.simulationTime, result, deployment);
        const point = edited ? getLngLat(edited.position) : simulationPosition ? [simulationPosition.longitude, simulationPosition.latitude] as [number, number] : undefined;
        if (point) {
          axisSourceUnitIdRef.current = unitId;
          drawPointsRef.current = [point];
          setDrawPointCount(1);
        }
        return;
      }
      if (editor.mode.type === 'select' && (liveId || baseUnitId)) {
        const selectedId = liveId ?? baseUnitId!;
        editor.onSelectUnit(selectedId);
        if (baseUnitId) onSelectUnit(baseUnitId);
        return;
      }
      const ray = viewer.camera.getPickRay(movement.position);
      const cartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const coordinate = Cartographic.fromCartesian(cartesian);
      const position = { lng: CesiumMath.toDegrees(coordinate.longitude), lat: CesiumMath.toDegrees(coordinate.latitude) };
      if (editor.relocatingUnitId) editor.onMoveUnit(editor.relocatingUnitId, position);
      else if (editor.mode.type === 'place') {
        if (editor.mode.item.kind === 'unit') editor.onPlaceUnit(editor.mode.item, position);
        else editor.onPlaceObjective(position);
      } else if (editor.mode.type === 'draw' || editor.mode.type === 'draw-task') {
        if (editor.mode.type === 'draw' && editor.mode.graphicType === 'freehand') return;
        drawPointsRef.current = [...drawPointsRef.current, [position.lng, position.lat]];
        setDrawPointCount(drawPointsRef.current.length);
        if (editor.mode.type === 'draw' && editor.mode.graphicType === 'axis') finishDrawingRef.current();
        else if (editor.mode.type === 'draw-task') {
          const task = getTacticalTask(editor.mode.definitionId);
          if (task && drawPointsRef.current.length === task.maxPoints) finishDrawingRef.current();
        }
      } else if (editor.mode.type === 'append-geometry') {
        const graphicId = editor.mode.graphicId;
        const graphic = editor.tacticalGraphics.find(item => item.id === graphicId);
        if (!graphic) return;
        const point: [number, number] = [position.lng, position.lat];
        const selectedVertex = editingVertexRef.current;
        if (graphic.type === 'axis' && graphic.sourceUnitId && selectedVertex !== 1) return;
        if (graphic.geometry.type === 'Polygon') {
          const vertices = graphic.geometry.coordinates[0].slice(0, -1);
          const next = selectedVertex === undefined ? [...vertices, point] : vertices.map((item, index) => index === selectedVertex ? point : item);
          editor.onUpdateGraphic({ ...graphic, geometry: { type: 'Polygon', coordinates: [[...next, next[0]]] } });
        } else {
          const next = selectedVertex === undefined ? [...graphic.geometry.coordinates, point] : graphic.geometry.coordinates.map((item, index) => index === selectedVertex ? point : item);
          const task = getTacticalTask(graphic.tacticalSymbol?.definitionId);
          if (!task || next.length <= task.maxPoints) editor.onUpdateGraphic({ ...graphic, geometry: { type: 'LineString', coordinates: next } });
        }
        editingVertexRef.current = undefined;
        setEditingVertex(undefined);
      } else if (editor.mode.type === 'select') editor.onSelectUnit(undefined);
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [clock, deployment, onSelectUnit, ready, result]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editor = liveEditRef.current;
      if (!editor || editor.editingEnabled === false || (event.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (event.key === 'Enter' && (editor.mode.type === 'draw' || editor.mode.type === 'draw-task')) {
        event.preventDefault(); finishDrawingRef.current();
      } else if (event.key === 'Backspace' && (editor.mode.type === 'draw' || editor.mode.type === 'draw-task')) {
        event.preventDefault(); drawPointsRef.current = drawPointsRef.current.slice(0, -1); setDrawPointCount(drawPointsRef.current.length);
      } else if (event.key === 'Escape') {
        editor.onSelectUnit(undefined); editor.onModeChange({ type: 'select' });
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && editor.mode.type === 'select' && editor.selectedUnitId) {
        event.preventDefault(); editor.onDeleteUnit(editor.selectedUnitId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const source = liveSourceRef.current;
    if (!ready || !source) return;
    let cancelled = false;
    const render = async () => {
      const editor = liveEdit;
      source.entities.removeAll();
      if (!editor) return;
      const symbols = new Map(await Promise.all(editor.units.map(async unit => [unit.id, await symbolCanvas(unit)] as const)));
      if (cancelled) return;
      for (const unit of editor.units) {
        const [lng, lat] = getLngLat(unit.position);
        const selected = unit.id === editor.selectedUnitId;
        const size = get3DUnitSymbolSize(unit.symbolScale);
        source.entities.add({
          id: `live-unit:${unit.id}`,
          position: Cartesian3.fromDegrees(lng, lat, 10),
          billboard: { image: symbols.get(unit.id), width: size * (selected ? 3 : 2.4), height: size * (selected ? 3 : 2.4), verticalOrigin: VerticalOrigin.BOTTOM, horizontalOrigin: HorizontalOrigin.CENTER, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: runtime.tacticalLayers.labels ? unit.designation : '', font: '700 13px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, 10), verticalOrigin: VerticalOrigin.TOP, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        });
      }
      for (const objective of editor.objectives) {
        const [lng, lat] = getLngLat(objective.position);
        const selected = objective.id === editor.selectedUnitId;
        source.entities.add({
          id: `live-objective:${objective.id}`,
          position: Cartesian3.fromDegrees(lng, lat, 5),
          point: { color: cssColor(selected ? '#ffb95f' : '#80d8ff'), pixelSize: selected ? 16 : 11, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: `OBJ · ${objective.name}`, font: '700 13px sans-serif', fillColor: cssColor('#80d8ff'), outlineColor: Color.BLACK, outlineWidth: 4, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(0, -22), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        });
      }
      const addGraphic = (graphic: TacticalGraphic, id = `live-graphic:${graphic.id}`, preview = false) => {
        const color = cssColor(preview ? '#ffb95f' : graphicColor(graphic));
        const selected = graphic.id === editor.selectedUnitId;
        let coordinates = tacticalPositions(graphic);
        if (graphic.type === 'axis' && graphic.sourceUnitId && coordinates.length >= 2) {
          const edited = editor.units.find(unit => unit.id === graphic.sourceUnitId);
          const simulationPosition = edited ? undefined : getUnitPositionAtTime(graphic.sourceUnitId, clock.current.simulationTime, result, deployment);
          const start = edited ? getLngLat(edited.position) : simulationPosition ? [simulationPosition.longitude, simulationPosition.latitude] as [number, number] : undefined;
          if (start) coordinates = [start, ...coordinates.slice(1)];
        }
        if (graphic.geometry.type === 'Polygon' && coordinates.length >= 3) {
          source.entities.add({ id, polygon: { hierarchy: new PolygonHierarchy(coordinates.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat))), material: color.withAlpha(0.12), outline: true, outlineColor: color, heightReference: HeightReference.CLAMP_TO_GROUND } });
        } else if (coordinates.length >= 2) {
          const displayCoordinates = graphic.type === 'axis' ? axisDisplayCoordinates(coordinates) : coordinates;
          source.entities.add({
            id,
            polyline: {
              positions: displayCoordinates.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 4)),
              width: selected ? 7 : graphic.type === 'axis' ? 6 : preview ? 5 : 4,
              clampToGround: true,
              material: graphicLineMaterial(graphic, color),
            },
            ...graphicLabel(graphic, coordinates, color),
          });
        } else if (coordinates.length === 1) {
          source.entities.add({ id, position: Cartesian3.fromDegrees(coordinates[0][0], coordinates[0][1], 5), point: { color, pixelSize: selected ? 16 : 12, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
        }
      };
      editor.tacticalGraphics.forEach(graphic => addGraphic(graphic));
      if (editor.mode.type === 'draw' || editor.mode.type === 'draw-task') {
        const points = drawPointsRef.current;
        if (points.length >= 2) addGraphic({ id: 'preview', type: 'route', geometry: { type: 'LineString', coordinates: points } }, 'live-preview', true);
        if (!(editor.mode.type === 'draw' && editor.mode.graphicType === 'freehand')) points.forEach((point, index) => source.entities.add({ id: `live-preview-point:${index}`, position: Cartesian3.fromDegrees(point[0], point[1], 6), point: { color: cssColor('#ffb95f'), pixelSize: 10, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      }
      if (editor.mode.type === 'append-geometry') {
        const graphicId = editor.mode.graphicId;
        const graphic = editor.tacticalGraphics.find(item => item.id === graphicId);
        const points = graphic?.geometry.type === 'Polygon' ? graphic.geometry.coordinates[0].slice(0, -1) : graphic?.geometry.coordinates ?? [];
        points.forEach((point, index) => source.entities.add({ id: `live-vertex:${index}`, position: Cartesian3.fromDegrees(point[0], point[1], 8), point: { color: cssColor(index === editingVertex ? '#ffb95f' : '#ffffff'), pixelSize: 12, outlineColor: Color.BLACK, outlineWidth: 3, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [clock, deployment, drawPointCount, editingVertex, liveEdit?.mode, liveEdit?.objectives, liveEdit?.selectedUnitId, liveEdit?.tacticalGraphics, liveEdit?.units, ready, result, runtime.tacticalLayers.labels]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let previousTime = Number.NaN;
    let previousOverlayTime = Number.NaN;
    let previousUnitUpdateTimestamp = Number.NEGATIVE_INFINITY;
    let previousOverlayUpdateTimestamp = Number.NEGATIVE_INFINITY;
    const previousUnitPositions = new Map<string, SimulationResultPosition>();
    const tick = (timestamp: number) => {
      const time = clock.current.simulationTime;
      // Cesium renders independently. Replacing Entity properties on every
      // browser frame only adds main-thread pressure and makes camera dragging
      // stutter, while 30 updates per second is still visually smooth.
      if (time !== previousTime && timestamp - previousUnitUpdateTimestamp >= 1000 / 30) {
        const visible = new Set<string>();
        const editor = liveEditRef.current;
        const replacedIds = new Set(editor?.units.map(unit => unit.id) ?? []);
        const hiddenIds = new Set(editor?.hiddenBaseUnitIds ?? []);
        for (const item of positionsAtTime(result, units, time)) {
          visible.add(item.unitId);
          const entity = unitEntitiesRef.current.get(item.unitId);
          if (entity) {
            entity.show = !replacedIds.has(item.unitId) && !hiddenIds.has(item.unitId);
            const previousPosition = previousUnitPositions.get(item.unitId);
            if (previousPosition?.longitude !== item.position.longitude || previousPosition?.latitude !== item.position.latitude) {
              entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(item.position.longitude, item.position.latitude, 10));
              previousUnitPositions.set(item.unitId, item.position);
            }
          }
        }
        for (const [unitId, entity] of unitEntitiesRef.current) entity.show = visible.has(unitId) && !replacedIds.has(unitId) && !hiddenIds.has(unitId);
        for (const entity of staticSourceRef.current?.entities.values ?? []) {
          const layer = entity.properties?.layer?.getValue();
          if (layer === 'route') {
            const startTime = Number(entity.properties?.startTime?.getValue());
            const endTime = Number(entity.properties?.endTime?.getValue());
            entity.show = clock.current.tacticalLayers.routes && startTime <= time && time < endTime;
          } else if (layer === 'control') entity.show = clock.current.tacticalLayers.controlLines;
        }
        previousTime = time;
        previousUnitUpdateTimestamp = timestamp;
      }
      // Action effects currently rebuild their Cesium entities. Cap that work
      // at 10 Hz so faster playback cannot starve pointer input.
      if (!Number.isFinite(previousOverlayTime) || (
        Math.abs(time - previousOverlayTime) >= 0.04
        && timestamp - previousOverlayUpdateTimestamp >= 100
      )) {
        if (actionSourceRef.current) updateActions(actionSourceRef.current, result, deployment, time, atomicActionVisuals);
        previousOverlayTime = time;
        previousOverlayUpdateTimestamp = timestamp;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [atomicActionVisuals, clock, deployment, ready, result, units]);

  useEffect(() => {
    for (const [unitId, entity] of unitEntitiesRef.current) {
      if (entity.billboard) entity.billboard.scale = new ConstantProperty(unitId === runtime.selectedUnitId ? 1.22 : 1);
      if (entity.label) entity.label.show = new ConstantProperty(runtime.tacticalLayers.labels);
    }
  }, [runtime.selectedUnitId, runtime.tacticalLayers.labels]);

  useEffect(() => {
    const replacedIds = new Set(liveEdit?.units.map(unit => unit.id) ?? []);
    const hiddenIds = new Set(liveEdit?.hiddenBaseUnitIds ?? []);
    const visibleIds = new Set(positionsAtTime(result, units, clock.current.simulationTime).map(item => item.unitId));
    for (const [unitId, entity] of unitEntitiesRef.current) {
      entity.show = visibleIds.has(unitId) && !replacedIds.has(unitId) && !hiddenIds.has(unitId);
    }
  }, [clock, liveEdit?.hiddenBaseUnitIds, liveEdit?.units, result, units]);

  const editingGraphicId = liveEdit?.mode.type === 'append-geometry' ? liveEdit.mode.graphicId : undefined;
  const hasRevisions = Boolean(liveEdit && (liveEdit.units.length || liveEdit.objectives.length || liveEdit.tacticalGraphics.length || liveEdit.hiddenBaseUnitIds.length));
  const editingGraphic = liveEdit?.tacticalGraphics.find(graphic => graphic.id === editingGraphicId);
  const editingPointCount = editingGraphic?.geometry.type === 'Polygon' ? editingGraphic.geometry.coordinates[0].length - 1 : editingGraphic?.geometry.coordinates.length ?? 0;
  const editingMinimumPoints = editingGraphic ? getTacticalTask(editingGraphic.tacticalSymbol?.definitionId)?.minPoints ?? (editingGraphic.geometry.type === 'Polygon' ? 3 : 2) : 0;
  const minimumDrawPoints = liveEdit?.mode.type === 'draw' ? liveEdit.mode.graphicType === 'area' ? 3 : 2 : liveEdit?.mode.type === 'draw-task' ? getTacticalTask(liveEdit.mode.definitionId)?.minPoints ?? Infinity : Infinity;
  const isFreehandMode = editingEnabled && liveEdit?.mode.type === 'draw' && liveEdit.mode.graphicType === 'freehand';
  const selectedMovable = Boolean(liveEdit?.selectedUnitId && (liveEdit.units.some(unit => unit.id === liveEdit.selectedUnitId) || deployment?.units.some(unit => unit.id === liveEdit.selectedUnitId) || liveEdit.objectives.some(objective => objective.id === liveEdit.selectedUnitId)));
  const deleteEditingVertex = () => {
    if (!liveEdit || liveEdit.mode.type !== 'append-geometry' || editingVertex === undefined || !editingGraphic) return;
    if (editingGraphic.geometry.type === 'Polygon') {
      const points = editingGraphic.geometry.coordinates[0].slice(0, -1);
      if (points.length <= editingMinimumPoints) return;
      const next = points.filter((_, index) => index !== editingVertex);
      liveEdit.onUpdateGraphic({ ...editingGraphic, geometry: { type: 'Polygon', coordinates: [[...next, next[0]]] } });
    } else {
      if (editingGraphic.geometry.coordinates.length <= editingMinimumPoints) return;
      liveEdit.onUpdateGraphic({ ...editingGraphic, geometry: { type: 'LineString', coordinates: editingGraphic.geometry.coordinates.filter((_, index) => index !== editingVertex) } });
    }
    editingVertexRef.current = undefined;
    setEditingVertex(undefined);
  };

  return <section className="relative flex-1 overflow-hidden bg-[#101418]" style={editingEnabled ? { '--palette-width': 'min(380px, calc(100vw - 32px))' } as CSSProperties : undefined}>
    <div ref={containerRef} className="absolute inset-0" />
    {isFreehandMode && <div className="absolute inset-0 z-[15] cursor-crosshair touch-none" aria-label="자유선 그리기 영역" onPointerDown={beginFreehand} onPointerMove={continueFreehand} onPointerUp={endFreehand} onPointerCancel={endFreehand} />}
    <div className={`pointer-events-none absolute z-10 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur ${editingEnabled ? 'left-4 top-[72px]' : 'left-6 top-6'}`}>CESIUMJS 3D · {editingEnabled ? 'LIVE EDIT' : hasRevisions ? 'REVISED STATE' : 'ACTION PLAYBACK'}</div>
    {editingEnabled && liveEdit && <>
      <SymbolPalette mode={liveEdit.mode} onModeChange={liveEdit.onModeChange} isOpen={liveEdit.paletteOpen} onToggle={liveEdit.onTogglePalette} />
      {graphicError && <p role="alert" className="absolute left-4 top-16 z-30 max-w-lg rounded bg-surface/95 p-3 text-sm text-error">{graphicError}</p>}
      {liveEdit.mode.type === 'select' && liveEdit.selectedUnitId && <div className="absolute bottom-5 left-4 z-30 flex gap-2">
        {selectedMovable && <button type="button" className={`rounded border px-3 py-2 font-data-mono text-xs shadow ${liveEdit.relocatingUnitId ? 'border-secondary bg-secondary text-on-secondary' : 'border-outline-variant bg-surface/90 text-on-surface'}`} onClick={() => liveEdit.onSetRelocatingUnit(liveEdit.relocatingUnitId ? undefined : liveEdit.selectedUnitId)}>{liveEdit.relocatingUnitId ? '이동할 지도 위치 클릭' : '선택 항목 이동'}</button>}
        <button type="button" className="rounded border border-error/60 bg-surface/90 px-3 py-2 font-data-mono text-xs text-error shadow" onClick={() => liveEdit.onDeleteUnit(liveEdit.selectedUnitId!)}>선택 항목 삭제</button>
      </div>}
      {liveEdit.mode.type === 'append-geometry' && <div className="absolute bottom-5 left-4 z-30 flex gap-2">
        <span className="rounded border border-outline-variant bg-surface/90 px-3 py-2 font-data-mono text-xs text-on-surface">{editingVertex === undefined ? '점을 누르면 이동 · 빈 지도 클릭은 점 추가' : `${editingVertex + 1}번 점 선택 · 새 위치 클릭`}</span>
        <button type="button" disabled={editingVertex === undefined || editingPointCount <= editingMinimumPoints} className="rounded border border-error/60 bg-surface/90 px-3 py-2 text-xs text-error disabled:opacity-40" onClick={deleteEditingVertex}>선택 점 삭제</button>
        <button type="button" className="rounded bg-secondary px-3 py-2 text-xs text-on-secondary" onClick={() => liveEdit.onModeChange({ type: 'select' })}>편집 완료</button>
      </div>}
      {(liveEdit.mode.type === 'draw' || liveEdit.mode.type === 'draw-task') && <div className="absolute bottom-5 left-4 z-30 flex gap-2">
        <span className="rounded border border-outline-variant bg-surface/90 px-3 py-2 font-data-mono text-xs text-on-surface">{isFreehandMode ? drawPointCount ? `자유선 그리는 중 · ${drawPointCount}점` : '마우스나 펜을 누른 채 드래그하세요' : liveEdit.mode.type === 'draw' && liveEdit.mode.graphicType === 'axis' ? drawPointCount === 0 ? 'Axis · 출발 유닛을 클릭하세요' : 'Axis · 도착 지점을 클릭하세요' : `기준점 ${drawPointCount}개`}</span>
        {!isFreehandMode && <button type="button" disabled={!drawPointCount} className="rounded bg-surface/90 px-3 py-2 text-xs text-on-surface disabled:opacity-40" onClick={() => { drawPointsRef.current = drawPointsRef.current.slice(0, -1); if (!drawPointsRef.current.length) axisSourceUnitIdRef.current = undefined; setDrawPointCount(drawPointsRef.current.length); }}>마지막 점 취소</button>}
        {!isFreehandMode && <button type="button" disabled={drawPointCount < minimumDrawPoints} className="rounded bg-secondary px-3 py-2 text-xs text-on-secondary disabled:opacity-40" onClick={finishDrawing}>그리기 완료</button>}
        <button type="button" className="rounded border border-outline-variant bg-surface/90 px-3 py-2 text-xs text-on-surface" onClick={() => liveEdit.onModeChange({ type: 'select' })}>취소</button>
      </div>}
      {liveEdit.selectedUnitId && <UnitPropertiesPanel
        deployment={{ id: deployment?.id ?? 'live-edit', name: deployment?.name ?? 'Live Edit', mettTcDocumentId: deployment?.mettTcDocumentId ?? '', units: [...(deployment?.units ?? []).filter(unit => !liveEdit.hiddenBaseUnitIds.includes(unit.id) && !liveEdit.units.some(edited => edited.id === unit.id)), ...liveEdit.units], objectives: liveEdit.objectives, tacticalGraphics: liveEdit.tacticalGraphics }}
        selectedEntityId={liveEdit.selectedUnitId}
        onChange={liveEdit.onChangeDeployment}
        onModeChange={liveEdit.onModeChange}
        onClearSelection={() => liveEdit.onSelectUnit(undefined)}
      />}
    </>}
    {!ready && !error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90 text-sm text-on-surface-variant">CesiumJS 3D 지도를 불러오는 중입니다…</div>}
    {error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/95 p-6"><div className="max-w-xl rounded border border-error/50 bg-surface-container-high p-6 text-center"><p className="font-label-caps text-error">CESIUM MAP UNAVAILABLE</p><p className="mt-2 text-sm text-on-surface">{error}</p></div></div>}
  </section>;
}
