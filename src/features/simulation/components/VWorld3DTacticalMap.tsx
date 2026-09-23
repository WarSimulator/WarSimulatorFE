import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomDataSource, Entity, Viewer } from 'cesium';
import type { AtomicActionEffect, DeploymentSetup, SimulationResult, SimulationResultPosition, SimulationRuntimeState, SimulationUnit, TacticalGraphic } from '../../../types';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { graphicColor } from '../lib/graphicColor';
import { getLngLat } from '../lib/position';
import { getTrackPositionsAtTime, getUnitPositionAtTime, isUnitEliminated } from '../lib/playback';
import { buildObservationSector, getActiveObservationEffects } from '../lib/observation';
import { resolvePlanReference } from '../lib/planReferenceMapping';
import { createMilitarySymbolSvg, get3DUnitSymbolSize } from '../lib/symbolSvg';
import { AtomicActionPlaybackOverlay } from './AtomicActionPlaybackOverlay';

type CesiumRuntime = typeof import('cesium');
type VWorldMap = {
  setOption: (options: Record<string, unknown>) => void;
  setMapId: (id: string) => void;
  setInitPosition: (position: unknown) => void;
  setLogoVisible?: (visible: boolean) => void;
  setNavigationZoomVisible?: (visible: boolean) => void;
  start: () => void;
  destroy?: () => void;
};
type VWorldNamespace = {
  Map: new () => VWorldMap;
  CoordZ: new (longitude: number, latitude: number, altitude: number) => unknown;
  Direction: new (heading: number, pitch: number, roll: number) => unknown;
  CameraPosition: new (coordinate: unknown, direction: unknown) => unknown;
  ws3dInitCallBack?: () => void;
};
type VWorldWindow = Window & typeof globalThis & { vw?: VWorldNamespace; Cesium?: CesiumRuntime; viewer?: Viewer };

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

let vworldLoad: Promise<VWorldNamespace> | undefined;

function loadVWorld(apiKey: string) {
  const globals = window as VWorldWindow;
  if (globals.vw) return Promise.resolve(globals.vw);
  if (vworldLoad) return vworldLoad;
  vworldLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.atlasVworld = 'true';
    script.src = `https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => {
      const startedAt = Date.now();
      const resolveWhenReady = () => {
        const loaded = window as VWorldWindow;
        if (loaded.vw) {
          resolve(loaded.vw);
          return;
        }
        if (Date.now() - startedAt >= 15_000) {
          reject(new Error('브이월드 WebGL 3D API가 초기화되지 않았습니다. 인증키의 허용 도메인을 확인해 주세요.'));
          return;
        }
        window.setTimeout(resolveWhenReady, 100);
      };
      resolveWhenReady();
    };
    script.onerror = () => reject(new Error('브이월드 WebGL 3D API를 불러오지 못했습니다. 인증키와 허용 도메인을 확인해 주세요.'));
    document.head.append(script);
  });
  return vworldLoad;
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

function addStaticLayers(C: CesiumRuntime, source: CustomDataSource, result: SimulationResult, deployment?: DeploymentSetup) {
  const color = (value: string, alpha = 1) => C.Color.fromCssColorString(value).withAlpha(alpha);
  for (const track of result.unitTracks) {
    for (const segment of track.segments) {
      const coordinates = segment.keyframes.map(frame => frame.position).filter((position, index, all) => index === 0 || position.longitude !== all[index - 1].longitude || position.latitude !== all[index - 1].latitude);
      if (coordinates.length < 2) continue;
      source.entities.add({
        id: `route:${track.unitId}:${segment.actionSequence}`,
        properties: { layer: 'route', startTime: segment.startTime, endTime: segment.endTime },
        polyline: { positions: coordinates.map(position => C.Cartesian3.fromDegrees(position.longitude, position.latitude, 4)), width: 4, clampToGround: true, material: new C.PolylineArrowMaterialProperty(color(segment.action === 'Withdraw' ? '#a78bfa' : '#ffb95f', 0.9)) },
      });
    }
  }
  for (const graphic of deployment?.tacticalGraphics ?? []) {
    const coordinates = tacticalPositions(graphic);
    if (!coordinates.length) continue;
    const graphicBaseColor = color(graphicColor(graphic));
    if (graphic.geometry.type === 'Polygon') {
      source.entities.add({ id: `graphic:${graphic.id}`, properties: { layer: 'control' }, polygon: { hierarchy: new C.PolygonHierarchy(coordinates.map(([lng, lat]) => C.Cartesian3.fromDegrees(lng, lat))), material: graphicBaseColor.withAlpha(0.1), outline: true, outlineColor: graphicBaseColor, heightReference: C.HeightReference.CLAMP_TO_GROUND } });
    } else if (coordinates.length >= 2) {
      source.entities.add({ id: `graphic:${graphic.id}`, properties: { layer: 'control' }, polyline: { positions: coordinates.map(([lng, lat]) => C.Cartesian3.fromDegrees(lng, lat, 3)), width: graphic.type === 'axis' ? 6 : 4, clampToGround: true, material: graphicBaseColor } });
    }
  }
  for (const objective of deployment?.objectives ?? []) {
    const [lng, lat] = getLngLat(objective.position);
    source.entities.add({ id: `objective:${objective.id}`, properties: { layer: 'control' }, position: C.Cartesian3.fromDegrees(lng, lat, 5), point: { color: color('#80d8ff'), pixelSize: 11, outlineColor: C.Color.BLACK, outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY }, label: { text: `OBJ · ${objective.name}`, font: '700 13px sans-serif', fillColor: color('#80d8ff'), outlineColor: C.Color.BLACK, outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -22), heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  }
}

function updateActions(C: CesiumRuntime, source: CustomDataSource, result: SimulationResult, deployment: DeploymentSetup | undefined, time: number, atomicActionVisuals: boolean) {
  source.entities.removeAll();
  const color = (value: string, alpha = 1) => C.Color.fromCssColorString(value).withAlpha(alpha);
  const addDirected = (key: string, action: string, origin: SimulationResultPosition, target?: SimulationResultPosition, progress = 0) => {
    const actionColor = color(ACTION_COLORS[action] ?? '#f8c66d');
    const pulse = target ?? origin;
    const fire = FIRE_ACTIONS.has(action);
    if (target && (target.longitude !== origin.longitude || target.latitude !== origin.latitude)) {
      const altitude = fire ? 80 : 8;
      source.entities.add({ id: `${key}:line`, polyline: { positions: [C.Cartesian3.fromDegrees(origin.longitude, origin.latitude, altitude), C.Cartesian3.fromDegrees(target.longitude, target.latitude, altitude)], width: fire ? 7 : 5, material: actionColor, clampToGround: !fire } });
    }
    const radius = (fire ? 115 : action === 'Observe' ? 160 : 105) * (0.75 + 0.3 * Math.sin(progress * Math.PI * 2));
    source.entities.add({ id: `${key}:pulse`, position: C.Cartesian3.fromDegrees(pulse.longitude, pulse.latitude, 3), ellipse: { semiMajorAxis: radius, semiMinorAxis: radius, material: actionColor.withAlpha(0.18), outline: true, outlineColor: actionColor, heightReference: C.HeightReference.CLAMP_TO_GROUND } });
    if (fire && target) {
      const frame = Math.floor(progress * 64) % 32;
      source.entities.add({ id: `${key}:vfx`, position: C.Cartesian3.fromDegrees(target.longitude, target.latitude, 10), billboard: { image: `/vfx/frames/explosion/frame-${String(frame).padStart(2, '0')}.png`, width: 112, height: 112, verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    }
  };
  for (const observation of getActiveObservationEffects(result, time)) {
    const origin = getUnitPositionAtTime(observation.actor, time, result, deployment) ?? observation.origin;
    const sector = buildObservationSector({ ...observation, origin, direction: observation.direction + Math.sin((time - observation.startTime) * Math.PI / 2) * observation.fovDegrees * 0.1 }).geometry.coordinates[0];
    source.entities.add({ id: `observe:${observation.actionSequence}`, polygon: { hierarchy: new C.PolygonHierarchy(sector.map(([lng, lat]) => C.Cartesian3.fromDegrees(lng, lat, 4))), material: color('#66d9ff', 0.13), outline: true, outlineColor: color('#66d9ff', 0.6), heightReference: C.HeightReference.CLAMP_TO_GROUND } });
  }
  for (const effect of result.actionEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime || (atomicActionVisuals && ['Move', 'Withdraw', 'Observe'].includes(effect.action))) continue;
    const origin = getUnitPositionAtTime(effect.unitId, time, result, deployment) ?? getUnitPositionAtTime(effect.actor, time, result, deployment) ?? effect.origin;
    const target = actionTarget(effect, result, deployment, time);
    const progress = Math.max(0, Math.min(1, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime)));
    const area = atomicActionVisuals && AREA_ACTIONS.has(effect.action) ? actionArea(effect, deployment) : undefined;
    if (area && area.length >= 3) {
      const actionColor = color(ACTION_COLORS[effect.action] ?? '#f8c66d');
      source.entities.add({ id: `action:${effect.actionSequence}:area`, polygon: { hierarchy: new C.PolygonHierarchy(area.map(([lng, lat]) => C.Cartesian3.fromDegrees(lng, lat))), material: actionColor.withAlpha(0.05 + progress * 0.16), outline: true, outlineColor: actionColor, heightReference: C.HeightReference.CLAMP_TO_GROUND } });
    } else addDirected(`action:${effect.actionSequence}`, effect.action, origin, target, progress);
  }
  for (const effect of result.engagementEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime) continue;
    const origin = getUnitPositionAtTime(effect.actor, time, result, deployment);
    const target = getUnitPositionAtTime(effect.target, time, result, deployment) ?? resolvePlanReference(deployment, effect.target);
    if (origin) addDirected(`engage:${effect.actionSequence}`, effect.action, origin, target, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime));
  }
}

export function VWorld3DTacticalMap({ runtime, playbackRef, units, result, deployment, onSelectUnit, atomicActionVisuals = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unitEntitiesRef = useRef(new Map<string, Entity>());
  const staticSourceRef = useRef<CustomDataSource | undefined>(undefined);
  const actionSourceRef = useRef<CustomDataSource | undefined>(undefined);
  const cesiumRef = useRef<CesiumRuntime | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const clock = playbackRef ?? { current: runtime };
  const center = useMemo(() => getCenter(result, deployment), [deployment, result]);
  const cameraRange = useMemo(() => getCameraRange(result, center), [center, result]);

  useEffect(() => {
    const container = containerRef.current;
    const apiKey = import.meta.env.VITE_VWORLD_API_KEY?.trim();
    if (!container) return;
    if (!apiKey) {
      setError('VITE_VWORLD_API_KEY가 설정되지 않았습니다. 브이월드에서 WebGL 3D API 인증키를 발급한 뒤 .env에 추가해 주세요.');
      return;
    }
    let cancelled = false;
    let map: VWorldMap | undefined;
    let viewer: Viewer | undefined;
    const initialize = async () => {
      try {
        const unitSymbols = new Map(await Promise.all(units.map(async unit => [unit.id, await symbolCanvas(unit)] as const)));
        const vw = await loadVWorld(apiKey);
        if (cancelled) return;
        const cameraPosition = new vw.CameraPosition(new vw.CoordZ(center.longitude, center.latitude, cameraRange), new vw.Direction(0, -48, 0));
        const initialized = await new Promise<{ viewer: Viewer; Cesium: CesiumRuntime }>((resolve, reject) => {
          const previousCallback = vw.ws3dInitCallBack;
          const timeout = window.setTimeout(() => reject(new Error('브이월드 3D 지도 초기화 시간이 초과되었습니다. 인증키의 허용 도메인을 확인해 주세요.')), 20_000);
          vw.ws3dInitCallBack = () => {
            previousCallback?.();
            const loaded = window as VWorldWindow;
            if (!loaded.viewer || !loaded.Cesium) return;
            window.clearTimeout(timeout);
            resolve({ viewer: loaded.viewer, Cesium: loaded.Cesium });
          };
          map = new vw.Map();
          map.setOption({ mapId: container.id, initPosition: cameraPosition, logo: true, navigation: true });
          map.setMapId(container.id);
          map.setInitPosition(cameraPosition);
          map.setLogoVisible?.(true);
          map.setNavigationZoomVisible?.(false);
          map.start();
        });
        viewer = initialized.viewer;
        const C = initialized.Cesium;
        cesiumRef.current = C;
        if (cancelled) return;
        const staticSource = new C.CustomDataSource('vworld-static-tactical-layers');
        const actionSource = new C.CustomDataSource('vworld-atomic-action-effects');
        await viewer.dataSources.add(staticSource);
        await viewer.dataSources.add(actionSource);
        staticSourceRef.current = staticSource;
        actionSourceRef.current = actionSource;
        addStaticLayers(C, staticSource, result, deployment);
        for (const unit of units) {
          const position = unit.geographicPosition ?? getUnitPositionAtTime(unit.id, result.startTime, result, deployment);
          if (!position) continue;
          const size = get3DUnitSymbolSize(unit.symbolScale);
          const entity = viewer.entities.add({
            id: `atlas-unit:${unit.id}`,
            position: C.Cartesian3.fromDegrees(position.longitude, position.latitude, 10),
            billboard: { image: unitSymbols.get(unit.id), width: size * 2.4, height: size * 2.4, verticalOrigin: C.VerticalOrigin.BOTTOM, horizontalOrigin: C.HorizontalOrigin.CENTER, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new C.NearFarScalar(500, 1.15, 60_000, 0.72) },
            label: { text: unit.name, font: '700 13px sans-serif', fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, 10), verticalOrigin: C.VerticalOrigin.TOP, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          });
          unitEntitiesRef.current.set(unit.id, entity);
        }
        viewer.selectedEntityChanged.addEventListener(entity => {
          if (entity?.id.startsWith('atlas-unit:')) onSelectUnit(entity.id.slice('atlas-unit:'.length));
        });
        setReady(true);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '브이월드 3D 지도를 초기화하지 못했습니다.');
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      unitEntitiesRef.current.clear();
      staticSourceRef.current = undefined;
      actionSourceRef.current = undefined;
      cesiumRef.current = undefined;
      map?.destroy?.();
      container.replaceChildren();
    };
  }, [cameraRange, center, deployment, onSelectUnit, result, units]);

  useEffect(() => {
    const C = cesiumRef.current;
    if (!ready || !C) return;
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
            entity.position = new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(item.position.longitude, item.position.latitude, 10));
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
      if (!Number.isFinite(previousOverlayTime) || Math.abs(time - previousOverlayTime) >= 0.075) {
        if (actionSourceRef.current) updateActions(C, actionSourceRef.current, result, deployment, time, atomicActionVisuals);
        previousOverlayTime = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [atomicActionVisuals, clock, deployment, ready, result, units]);

  useEffect(() => {
    const C = cesiumRef.current;
    if (!C) return;
    for (const [unitId, entity] of unitEntitiesRef.current) {
      if (entity.billboard) entity.billboard.scale = new C.ConstantProperty(unitId === runtime.selectedUnitId ? 1.22 : 1);
      if (entity.label) entity.label.show = new C.ConstantProperty(runtime.tacticalLayers.labels);
    }
  }, [runtime.selectedUnitId, runtime.tacticalLayers.labels]);

  return <section className="relative flex-1 overflow-hidden bg-[#101418]">
    <div id="atlas-vworld-3d-map" ref={containerRef} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-6 top-6 z-10 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur">VWORLD WEBGL 3D · ACTION PLAYBACK</div>
    {atomicActionVisuals && ready && <AtomicActionPlaybackOverlay result={result} deployment={deployment} simulationTime={runtime.simulationTime} selectedUnitId={runtime.selectedUnitId} onSelectUnit={onSelectUnit} />}
    {!ready && !error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90 text-sm text-on-surface-variant">브이월드 WebGL 3D 지도를 불러오는 중입니다…</div>}
    {error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/95 p-6"><div className="max-w-xl rounded border border-error/50 bg-surface-container-high p-6 text-center"><p className="font-label-caps text-error">VWORLD MAP UNAVAILABLE</p><p className="mt-2 text-sm text-on-surface">{error}</p><p className="mt-3 text-xs text-on-surface-variant">브이월드 인증키 신청 시 WebGL 3D 지도 API와 현재 실행 도메인을 등록해야 합니다.</p></div></div>}
  </section>;
}
