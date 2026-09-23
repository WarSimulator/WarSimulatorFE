import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BillboardGraphics,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  CustomDataSource,
  EllipsoidTerrainProvider,
  Entity,
  HeadingPitchRange,
  HeightReference,
  HorizontalOrigin,
  Ion,
  IonImageryProvider,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  PolygonHierarchy,
  PolylineArrowMaterialProperty,
  Terrain,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { AtomicActionEffect, DeploymentSetup, SimulationResult, SimulationResultPosition, SimulationRuntimeState, SimulationUnit, TacticalGraphic } from '../../../types';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { graphicColor } from '../lib/graphicColor';
import { getLngLat } from '../lib/position';
import { getTrackPositionsAtTime, getUnitPositionAtTime, isUnitEliminated } from '../lib/playback';
import { buildObservationSector, getActiveObservationEffects } from '../lib/observation';
import { resolvePlanReference } from '../lib/planReferenceMapping';
import { createMilitarySymbolSvg, get3DUnitSymbolSize } from '../lib/symbolSvg';
import { AtomicActionPlaybackOverlay } from './AtomicActionPlaybackOverlay';

type Props = {
  runtime: SimulationRuntimeState;
  playbackRef?: { current: SimulationRuntimeState };
  units: SimulationUnit[];
  result: SimulationResult;
  deployment?: DeploymentSetup;
  onSelectUnit: (unitId: string) => void;
  atomicActionVisuals?: boolean;
};

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

async function symbolCanvas(unit: SimulationUnit) {
  const size = get3DUnitSymbolSize(unit.symbolScale);
  const svg = createMilitarySymbolSvg(unit.sidc ?? unit.icon, size, undefined, unit.symbolStandard);
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
      source.entities.add({
        id: `graphic:${graphic.id}`,
        properties: { layer: 'control' },
        polyline: { positions: coordinates.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 3)), width: graphic.type === 'axis' ? 6 : 4, clampToGround: true, material: color },
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
  source.entities.removeAll();
  const addDirected = (key: string, action: string, origin: SimulationResultPosition, target?: SimulationResultPosition, progress = 0) => {
    const color = cssColor(ACTION_COLORS[action] ?? '#f8c66d');
    const pulse = target ?? origin;
    const fire = FIRE_ACTIONS.has(action);
    if (target && (target.longitude !== origin.longitude || target.latitude !== origin.latitude)) {
      const altitude = fire ? 80 : 8;
      source.entities.add({ id: `${key}:line`, polyline: { positions: [Cartesian3.fromDegrees(origin.longitude, origin.latitude, altitude), Cartesian3.fromDegrees(target.longitude, target.latitude, altitude)], width: fire ? 7 : 5, material: color, clampToGround: !fire } });
    }
    const radius = (FIRE_ACTIONS.has(action) ? 115 : action === 'Observe' ? 160 : 105) * (0.75 + 0.3 * Math.sin(progress * Math.PI * 2));
    source.entities.add({ id: `${key}:pulse`, position: Cartesian3.fromDegrees(pulse.longitude, pulse.latitude, 3), ellipse: { semiMajorAxis: radius, semiMinorAxis: radius, material: color.withAlpha(0.18), outline: true, outlineColor: color, heightReference: HeightReference.CLAMP_TO_GROUND } });
    if (fire && target) {
      const frame = Math.floor(progress * 64) % 32;
      source.entities.add({ id: `${key}:vfx`, position: Cartesian3.fromDegrees(target.longitude, target.latitude, 10), billboard: { image: `/vfx/frames/explosion/frame-${String(frame).padStart(2, '0')}.png`, width: 112, height: 112, verticalOrigin: VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    }
  };

  for (const observation of getActiveObservationEffects(result, time)) {
    const origin = getUnitPositionAtTime(observation.actor, time, result, deployment) ?? observation.origin;
    const sector = buildObservationSector({ ...observation, origin, direction: observation.direction + Math.sin((time - observation.startTime) * Math.PI / 2) * observation.fovDegrees * 0.1 }).geometry.coordinates[0];
    source.entities.add({ id: `observe:${observation.actionSequence}`, polygon: { hierarchy: new PolygonHierarchy(sector.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, 4))), material: cssColor('#66d9ff', 0.13), outline: true, outlineColor: cssColor('#66d9ff', 0.6), heightReference: HeightReference.CLAMP_TO_GROUND } });
  }
  for (const effect of result.actionEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime || (atomicActionVisuals && ['Move', 'Withdraw', 'Observe'].includes(effect.action))) continue;
    const origin = getUnitPositionAtTime(effect.unitId, time, result, deployment) ?? getUnitPositionAtTime(effect.actor, time, result, deployment) ?? effect.origin;
    const target = actionTarget(effect, result, deployment, time);
    const progress = Math.max(0, Math.min(1, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime)));
    const area = atomicActionVisuals && AREA_ACTIONS.has(effect.action) ? actionArea(effect, deployment) : undefined;
    if (area && area.length >= 3) {
      const color = cssColor(ACTION_COLORS[effect.action] ?? '#f8c66d');
      source.entities.add({ id: `action:${effect.actionSequence}:area`, polygon: { hierarchy: new PolygonHierarchy(area.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat))), material: color.withAlpha(0.05 + progress * 0.16), outline: true, outlineColor: color, heightReference: HeightReference.CLAMP_TO_GROUND } });
    } else addDirected(`action:${effect.actionSequence}`, effect.action, origin, target, progress);
  }
  for (const effect of result.engagementEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime) continue;
    const origin = getUnitPositionAtTime(effect.actor, time, result, deployment);
    const target = getUnitPositionAtTime(effect.target, time, result, deployment) ?? resolvePlanReference(deployment, effect.target);
    if (origin) addDirected(`engage:${effect.actionSequence}`, effect.action, origin, target, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime));
  }
}

export function Cesium3DTacticalMap({ runtime, playbackRef, units, result, deployment, onSelectUnit, atomicActionVisuals = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unitEntitiesRef = useRef(new Map<string, Entity>());
  const staticSourceRef = useRef<CustomDataSource | undefined>(undefined);
  const actionSourceRef = useRef<CustomDataSource | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const clock = playbackRef ?? { current: runtime };
  const center = useMemo(() => getCenter(result, deployment), [deployment, result]);
  const cameraRange = useMemo(() => getCameraRange(result, center), [center, result]);

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
          skyBox: false,
          skyAtmosphere: false,
        });
        viewer.imageryLayers.addImageryProvider(imageryProvider);
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.backgroundColor = cssColor('#101418');
        const staticSource = new CustomDataSource('static-tactical-layers');
        const actionSource = new CustomDataSource('atomic-action-effects');
        viewer.dataSources.add(staticSource);
        viewer.dataSources.add(actionSource);
        staticSourceRef.current = staticSource;
        actionSourceRef.current = actionSource;
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
        viewer.selectedEntityChanged.addEventListener(entity => {
          if (entity?.id.startsWith('unit:')) onSelectUnit(entity.id.slice(5));
        });
        viewer.camera.lookAt(Cartesian3.fromDegrees(center.longitude, center.latitude), new HeadingPitchRange(0, CesiumMath.toRadians(-48), cameraRange));
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
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [cameraRange, center, deployment, onSelectUnit, result, units]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let previousTime = Number.NaN;
    let previousOverlayTime = Number.NaN;
    const tick = () => {
      const time = clock.current.simulationTime;
      if (time !== previousTime) {
        const visible = new Set<string>();
        for (const item of positionsAtTime(result, units, time)) {
          visible.add(item.unitId);
          const entity = unitEntitiesRef.current.get(item.unitId);
          if (entity) {
            entity.show = true;
            entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(item.position.longitude, item.position.latitude, 10));
          }
        }
        for (const [unitId, entity] of unitEntitiesRef.current) entity.show = visible.has(unitId);
        for (const entity of staticSourceRef.current?.entities.values ?? []) {
          const layer = entity.properties?.layer?.getValue();
          if (layer === 'route') {
            const startTime = Number(entity.properties?.startTime?.getValue());
            const endTime = Number(entity.properties?.endTime?.getValue());
            entity.show = clock.current.tacticalLayers.routes && startTime <= time && time < endTime;
          } else if (layer === 'control') entity.show = clock.current.tacticalLayers.controlLines;
        }
        previousTime = time;
      }
      if (!Number.isFinite(previousOverlayTime) || Math.abs(time - previousOverlayTime) >= 0.04) {
        if (actionSourceRef.current) updateActions(actionSourceRef.current, result, deployment, time, atomicActionVisuals);
        previousOverlayTime = time;
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

  return <section className="relative flex-1 overflow-hidden bg-[#101418]">
    <div ref={containerRef} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-6 top-6 z-10 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur">CESIUMJS 3D · ACTION PLAYBACK</div>
    {atomicActionVisuals && ready && <AtomicActionPlaybackOverlay result={result} deployment={deployment} simulationTime={runtime.simulationTime} selectedUnitId={runtime.selectedUnitId} onSelectUnit={onSelectUnit} />}
    {!ready && !error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90 text-sm text-on-surface-variant">CesiumJS 3D 지도를 불러오는 중입니다…</div>}
    {error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/95 p-6"><div className="max-w-xl rounded border border-error/50 bg-surface-container-high p-6 text-center"><p className="font-label-caps text-error">CESIUM MAP UNAVAILABLE</p><p className="mt-2 text-sm text-on-surface">{error}</p></div></div>}
  </section>;
}
