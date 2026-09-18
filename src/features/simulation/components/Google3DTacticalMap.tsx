import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AtomicActionEffect, DeploymentSetup, ObservationEffect, SimulationResult, SimulationResultPosition, SimulationRuntimeState, SimulationUnit } from '../../../types';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { graphicColor } from '../lib/graphicColor';
import { getTrackPositionsAtTime, getUnitPositionAtTime, isUnitEliminated } from '../lib/playback';
import { buildObservationSector, getActiveObservationEffects } from '../lib/observation';
import { resolvePlanReference } from '../lib/planReferenceMapping';
import { createMilitarySymbolSvg, get3DUnitSymbolSize } from '../lib/symbolSvg';
import { createOverlayStore, createOverlaySchedule } from '../lib/google3DOverlayStore';
import { scannerFillColor, scannerVisualForAffiliation } from '../lib/scannerVisual';
type ActionOverlayStore = ReturnType<typeof createOverlayStore>;

type Props = {
  runtime: SimulationRuntimeState;
  playbackRef?: { current: SimulationRuntimeState };
  units: SimulationUnit[];
  result: SimulationResult;
  deployment?: DeploymentSetup;
  onSelectUnit: (unitId: string) => void;
};

export type Position3D = { lat: number; lng: number; altitude?: number };
export type Map3DNode = HTMLElement;
export type Marker3DNode = HTMLElement & { position: Position3D; label?: string; zIndex?: number };
type StaticLayerNodes = {
  routes: Array<{ node: HTMLElement; startTime: number; endTime: number }>;
  controlLines: HTMLElement[];
  objectives: Marker3DNode[];
  unitLabels: Map<Marker3DNode, string>;
};
export type Maps3DLibrary = {
  Map3DElement: new (options: Record<string, unknown>) => Map3DNode;
  Marker3DInteractiveElement: new (options: Record<string, unknown>) => Marker3DNode;
  Polyline3DElement: new (options: Record<string, unknown>) => HTMLElement;
  Polyline3DInteractiveElement: new (options: Record<string, unknown>) => HTMLElement;
  Polygon3DElement: new (options: Record<string, unknown>) => HTMLElement;
  Polygon3DInteractiveElement: new (options: Record<string, unknown>) => HTMLElement;
};
type GoogleMapsRuntime = { maps: { importLibrary: (name: string) => Promise<unknown> } };

// A mesh follows the visible 3D surface (terrain, buildings, and vegetation),
// unlike the bare-earth ground model. Densifying paths keeps straight segments
// from cutting through a ridge or structure between distant control points.
export const SURFACE_ALTITUDE_MODE = 'RELATIVE_TO_MESH';
export const SURFACE_DRAWS_OCCLUDED_SEGMENTS = false;
const SURFACE_SAMPLE_METERS = 25;
const MAX_SURFACE_SAMPLES_PER_SEGMENT = 128;
const PHASE_LINE_DASH_METERS = 100;
const PHASE_LINE_GAP_METERS = 50;
const PHASE_LINE_DRAWS_OCCLUDED_SEGMENTS = true;
const ACTION_OVERLAY_INTERVAL_MS = 75;
const MAX_ROAD_SNAP_METERS = 500;
const FIRE_ACTIONS = new Set(['Engage', 'Continue to Engage', 'Fight', 'Ambush', 'Disrupt']);
const COMBAT_LINK_ALTITUDE_METERS = 600;
const ACTION_COLORS: Record<string, string> = {
  Move: '#ffb95f', Observe: '#66d9ff', Engage: '#ff5d5d', 'Continue to Engage': '#ff7b7b',
  'Establish Security': '#5bd4ff', 'Establish Presence': '#5bd4ff', Confirm: '#b4c5ff',
  'Confirm Control': '#64e7a2', Construct: '#ffd166', Adapt: '#c084fc', Decide: '#ffd166',
  'Re-Orient': '#c084fc', Adjust: '#c084fc', Demonstrate: '#fb923c', Integrate: '#60a5fa',
  Contain: '#fb923c', Block: '#fb923c', Report: '#a78bfa', Identify: '#b4c5ff',
  Fight: '#ff5d5d', Withdraw: '#a78bfa', 'Do not seek a decisive engagement': '#a78bfa',
  'Disassemble / Disarm': '#64e7a2', Ambush: '#ff5d5d', Breach: '#ffd166', Clear: '#5bd4ff',
  Seize: '#64e7a2', Disrupt: '#ff9f43',
};

let googleMapsLoad: Promise<GoogleMapsRuntime> | undefined;

export function loadGoogleMaps(apiKey: string) {
  const current = (window as Window & { google?: GoogleMapsRuntime }).google;
  if (current?.maps?.importLibrary) return Promise.resolve(current);
  if (googleMapsLoad) return googleMapsLoad;
  googleMapsLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.atlasGoogleMaps = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=beta&libraries=maps3d`;
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { google?: GoogleMapsRuntime }).google;
      if (loaded?.maps?.importLibrary) resolve(loaded);
      else reject(new Error('Google Maps API가 초기화되지 않았습니다.'));
    };
    script.onerror = () => reject(new Error('Google Maps API를 불러오지 못했습니다.'));
    document.head.append(script);
  });
  return googleMapsLoad;
}

function getCenter(result: SimulationResult, deployment?: DeploymentSetup): Position3D {
  const configured = deployment?.mapView?.center;
  if (configured) return { lng: configured[0], lat: configured[1], altitude: 0 };
  const positions = result.unitTracks.flatMap(track => track.segments.flatMap(segment => segment.keyframes.map(frame => frame.position)));
  if (!positions.length) return { lng: DEFAULT_MAP_CENTER[0], lat: DEFAULT_MAP_CENTER[1], altitude: 0 };
  return {
    lng: positions.reduce((sum, position) => sum + position.longitude, 0) / positions.length,
    lat: positions.reduce((sum, position) => sum + position.latitude, 0) / positions.length,
    altitude: 0,
  };
}

function getCameraRange(result: SimulationResult, center: Position3D) {
  const positions = result.unitTracks.flatMap(track => track.segments.flatMap(segment => segment.keyframes.map(frame => frame.position)));
  const farthest = positions.reduce((maximum, position) => {
    const latitudeMeters = (position.latitude - center.lat) * 111_000;
    const longitudeMeters = (position.longitude - center.lng) * 111_000 * Math.cos(center.lat * Math.PI / 180);
    return Math.max(maximum, Math.hypot(latitudeMeters, longitudeMeters));
  }, 0);
  return Math.max(1_500, Math.min(30_000, farthest * 3));
}

export function toSurfacePath(points: readonly Position3D[]): Position3D[] {
  if (points.length < 2) return [...points];
  // Explicit-altitude paths are deliberate 3D geometry. In particular, combat
  // links use two vertical legs and one straight aerial span, so sampling them
  // onto every terrain vertex would make the span appear glued to the ground.
  if (points.every(point => point.altitude !== undefined)) return [...points];
  const path: Position3D[] = [{ lat: points[0].lat, lng: points[0].lng, altitude: points[0].altitude }];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const latitudeMeters = (end.lat - start.lat) * 111_000;
    const longitudeMeters = (end.lng - start.lng) * 111_000 * Math.cos(((start.lat + end.lat) / 2) * Math.PI / 180);
    const samples = Math.max(1, Math.min(MAX_SURFACE_SAMPLES_PER_SEGMENT, Math.ceil(Math.hypot(latitudeMeters, longitudeMeters) / SURFACE_SAMPLE_METERS)));
    for (let sample = 1; sample <= samples; sample += 1) {
      const ratio = sample / samples;
      const altitude = (start.altitude ?? 0) + ((end.altitude ?? 0) - (start.altitude ?? 0)) * ratio;
      path.push({ lat: start.lat + (end.lat - start.lat) * ratio, lng: start.lng + (end.lng - start.lng) * ratio, altitude });
    }
  }
  return path;
}

function createPhaseLineLabel(library: Maps3DLibrary, position: Position3D, name: string, interactive = false) {
  const marker = new library.Marker3DInteractiveElement({
    position,
    altitudeMode: 'CLAMP_TO_GROUND',
    title: name,
    sizePreserved: true,
    zIndex: 10,
  });
  const label = document.createElement('span');
  label.textContent = name;
  Object.assign(label.style, {
    color: '#ffffff',
    fontFamily: 'Roboto, Arial, sans-serif',
    fontSize: '13px',
    fontWeight: '700',
    textShadow: '0 0 3px #121212, 0 0 3px #121212, 0 0 3px #121212',
    whiteSpace: 'nowrap',
  });
  marker.style.pointerEvents = interactive ? 'auto' : 'none';
  marker.append(label);
  return marker;
}

export function createPhaseLineNodes(
  library: Maps3DLibrary,
  points: readonly Position3D[],
  name: string,
  strokeWidth = 4,
  options: { interactive?: boolean; strokeColor?: string } = {},
) {
  const nodes: HTMLElement[] = [];
  const dashPaths: Position3D[][] = [];
  let drawing = true;
  let remaining = PHASE_LINE_DASH_METERS;
  let dash: Position3D[] = [];
  // Split by distance, preserving the pattern through control points. The
  // general surface sampler is capped at 128 points and cannot define dashes.
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(
      (end.lat - start.lat) * 111_000,
      (end.lng - start.lng) * 111_000 * Math.cos((start.lat + end.lat) / 2 * Math.PI / 180),
    );
    if (!Number.isFinite(length) || length < 0.001) continue;
    const at = (distance: number): Position3D => ({
      lat: start.lat + (end.lat - start.lat) * distance / length,
      lng: start.lng + (end.lng - start.lng) * distance / length,
    });
    let offset = 0;
    while (length - offset > 0.001) {
      const step = Math.min(remaining, length - offset);
      if (drawing) {
        if (!dash.length) dash.push(at(offset));
        dash.push(at(offset + step));
      }
      offset += step;
      remaining -= step;
      if (remaining < 0.001) {
        if (drawing && dash.length > 1) dashPaths.push(dash);
        dash = [];
        drawing = !drawing;
        remaining = drawing ? PHASE_LINE_DASH_METERS : PHASE_LINE_GAP_METERS;
      }
    }
  }
  if (dash.length > 1) dashPaths.push(dash);

  for (const path of dashPaths) {
    const LineElement = options.interactive ? library.Polyline3DInteractiveElement : library.Polyline3DElement;
    nodes.push(new LineElement({
      path,
      strokeColor: options.strokeColor ?? '#ffffff',
      outerColor: '#121212',
      outerWidth: 0.3,
      strokeWidth,
      // Drape the entire line on terrain instead of connecting elevated
      // mesh-relative vertices, which can intersect intervening ridges.
      altitudeMode: 'CLAMP_TO_GROUND',
      drawsOccludedSegments: PHASE_LINE_DRAWS_OCCLUDED_SEGMENTS,
    }));
  }

  if (points.length) {
    const first = points[0];
    const last = points[points.length - 1];
    const [upperEnd, lowerEnd] = first.lat >= last.lat ? [first, last] : [last, first];
    nodes.push(createPhaseLineLabel(library, upperEnd, name, options.interactive));
    nodes.push(createPhaseLineLabel(library, lowerEnd, name, options.interactive));
  }

  return nodes;
}

function position3D(position: SimulationResultPosition): Position3D {
  return { lat: position.latitude, lng: position.longitude };
}

function distanceMeters(first: SimulationResultPosition, second: SimulationResultPosition) {
  const latitudeMeters = (second.latitude - first.latitude) * 111_000;
  const longitudeMeters = (second.longitude - first.longitude) * 111_000
    * Math.cos(((first.latitude + second.latitude) / 2) * Math.PI / 180);
  return Math.hypot(latitudeMeters, longitudeMeters);
}

function visibleRoutePositions(segment: SimulationResult['unitTracks'][number]['segments'][number]) {
  const positions = segment.keyframes.map(frame => frame.position);
  if (positions.length < 3 || segment.routing?.generatedBy !== 'Road routing') return positions;
  const startsTooFarFromRoad = distanceMeters(positions[0], positions[1]) > MAX_ROAD_SNAP_METERS;
  const endsTooFarFromRoad = distanceMeters(positions.at(-2)!, positions.at(-1)!) > MAX_ROAD_SNAP_METERS;
  return startsTooFarFromRoad || endsTooFarFromRoad ? [positions[0], positions.at(-1)!] : positions;
}

function circlePath(center: Position3D, radiusMeters: number, points = 28): Position3D[] {
  const latitudeScale = radiusMeters / 111_000;
  const longitudeScale = radiusMeters / (111_000 * Math.max(0.1, Math.cos(center.lat * Math.PI / 180)));
  return Array.from({ length: points + 1 }, (_, index) => {
    const angle = index / points * Math.PI * 2;
    return { lat: center.lat + Math.cos(angle) * latitudeScale, lng: center.lng + Math.sin(angle) * longitudeScale, altitude: center.altitude };
  });
}

function actionColor(action: string) {
  return ACTION_COLORS[action] ?? '#f8c66d';
}

function actionPulseRadius(action: string, progress: number) {
  const base = FIRE_ACTIONS.has(action) ? 115 : action === 'Observe' ? 160 : action === 'Seize' || action === 'Contain' || action === 'Block' ? 180 : 95;
  return base * (0.75 + 0.3 * Math.sin(progress * Math.PI * 2));
}

function actionTarget(effect: Pick<AtomicActionEffect, 'parameters'>, result: SimulationResult, deployment: DeploymentSetup | undefined, time: number) {
  const parameters = effect.parameters;
  const reference = [parameters.target, parameters.destination, parameters.effectArea, parameters.result, parameters.recipient]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return reference ? getUnitPositionAtTime(reference, time, result, deployment) ?? resolvePlanReference(deployment, reference) : undefined;
}

function addPulse(nodes: ActionOverlayStore, key: string, center: Position3D, color: string, radiusMeters: number) {
  nodes.put(`${key}:pulse`, 'polygon', {
    path: circlePath(center, radiusMeters), fillColor: `${color}2e`, strokeColor: color, strokeWidth: 3,
    altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: SURFACE_DRAWS_OCCLUDED_SEGMENTS, zIndex: 30,
  });
}

function addDirectedAction(
  nodes: ActionOverlayStore,
  key: string,
  action: string,
  origin: Position3D,
  target: Position3D | undefined,
  progress: number,
) {
  const color = actionColor(action);
  const pulseCenter = target ?? origin;
  if (target && (target.lat !== origin.lat || target.lng !== origin.lng)) {
    const combatLink = FIRE_ACTIONS.has(action);
    const path = combatLink
      ? [
        { ...origin, altitude: 0 },
        { ...origin, altitude: COMBAT_LINK_ALTITUDE_METERS },
        { ...target, altitude: COMBAT_LINK_ALTITUDE_METERS },
        { ...target, altitude: 0 },
      ]
      : [origin, target];
    nodes.put(`${key}:line`, 'line', {
      path, strokeColor: color, outerColor: '#111827', outerWidth: 0.22, strokeWidth: combatLink ? 7 : 5,
      altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: SURFACE_DRAWS_OCCLUDED_SEGMENTS, zIndex: 29,
    });
  }
  addPulse(nodes, key, pulseCenter, color, actionPulseRadius(action, progress));
}

function addObservationAction(
  nodes: ActionOverlayStore,
  key: string,
  effect: ObservationEffect,
  result: SimulationResult,
  deployment: DeploymentSetup | undefined,
  time: number,
) {
  const origin = getUnitPositionAtTime(effect.actor, time, result, deployment) ?? effect.origin;
  const affiliation = deployment?.units.find(unit => unit.id === effect.actor || unit.designation === effect.actor)?.affiliation;
  const visual = scannerVisualForAffiliation(affiliation);
  const liveEffect = {
    ...effect,
    origin,
    direction: effect.direction + Math.sin((time - effect.startTime) * Math.PI / 2) * effect.fovDegrees * 0.1,
  };
  const sector = buildObservationSector(liveEffect, visual.fillOpacity)
    .geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng, altitude: visual.altitudeOffsetMeters }));
  // One polygon per sensor avoids overlapping translucent surfaces. Explicit
  // transparent stroke also avoids the SDK's default black boundary color.
  nodes.put(`${key}:scanner-fill`, 'polygon', {
    path: sector, fillColor: scannerFillColor(visual.fillColor, visual.fillOpacity),
    strokeColor: 'rgba(0, 0, 0, 0)', strokeWidth: 0,
    altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: visual.drawsOccludedSegments, zIndex: visual.zIndex,
  });
}

function updateActionOverlays(
  nodes: ActionOverlayStore,
  result: SimulationResult,
  deployment: DeploymentSetup | undefined,
  time: number,
) {
  nodes.begin();
  const activeObservations = getActiveObservationEffects(result, time);
  const observationSequences = new Set(activeObservations.map(effect => effect.actionSequence));
  activeObservations.forEach(effect => addObservationAction(nodes, `observe:${effect.actor}:${effect.actionSequence}`, effect, result, deployment, time));

  for (const effect of result.actionEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime || (effect.action === 'Observe' && observationSequences.has(effect.actionSequence))) continue;
    const origin = getUnitPositionAtTime(effect.unitId, time, result, deployment)
      ?? getUnitPositionAtTime(effect.actor, time, result, deployment)
      ?? effect.origin;
    const target = actionTarget(effect, result, deployment, time);
    const progress = Math.max(0, Math.min(1, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime)));
    addDirectedAction(nodes, `action:${effect.unitId}:${effect.actionSequence}`, effect.action, position3D(origin), target ? position3D(target) : undefined, progress);
  }

  for (const effect of result.engagementEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime) continue;
    const origin = getUnitPositionAtTime(effect.actor, time, result, deployment);
    const target = getUnitPositionAtTime(effect.target, time, result, deployment) ?? resolvePlanReference(deployment, effect.target);
    if (origin) addDirectedAction(nodes, `engage:${effect.actor}:${effect.actionSequence}`, effect.action, position3D(origin), target ? position3D(target) : undefined, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime));
  }

  for (const effect of result.seizureEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime) continue;
    const origin = getUnitPositionAtTime(effect.actor, time, result, deployment);
    const target = resolvePlanReference(deployment, effect.target);
    if (origin) addDirectedAction(nodes, `seize:${effect.actor}:${effect.actionSequence}`, effect.action, position3D(origin), target ? position3D(target) : undefined, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime));
  }
  nodes.end();
}

function positionsAtTime(result: SimulationResult, units: SimulationUnit[], time: number) {
  const moving = getTrackPositionsAtTime(result, time);
  const movingIds = new Set(moving.map(item => item.unitId));
  return [
    ...moving.flatMap(item => item.position ? [{ ...item, position: item.position }] : []),
    ...units.flatMap(unit => {
      const position = unit.geographicPosition;
      return !movingIds.has(unit.id) && !isUnitEliminated(result, unit.id, time) && position
        ? [{ unitId: unit.id, actor: unit.name, position }]
        : [];
    }),
  ];
}

function markerText(value?: string) {
  const text = value?.trim();
  return text ? { label: text, title: text } : {};
}

export function Google3DTacticalMap({ runtime, playbackRef, units, result, deployment, onSelectUnit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DNode | null>(null);
  const markersRef = useRef(new Map<string, Marker3DNode>());
  const staticLayersRef = useRef<StaticLayerNodes>({ routes: [], controlLines: [], objectives: [], unitLabels: new Map() });
  const actionOverlaysRef = useRef<ActionOverlayStore | null>(null);
  const fallbackPlaybackRef = useRef(runtime);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const center = useMemo(() => getCenter(result, deployment), [deployment, result]);
  const cameraRange = useMemo(() => getCameraRange(result, center), [center, result]);
  useEffect(() => { fallbackPlaybackRef.current = runtime; }, [runtime]);
  const clock = playbackRef ?? fallbackPlaybackRef;
  const refreshActionOverlays = useCallback((time: number) => {
    if (actionOverlaysRef.current) updateActionOverlays(actionOverlaysRef.current, result, deployment, time);
  }, [deployment, result]);

  useEffect(() => {
    setReady(false);
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setError('VITE_GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.');
      return;
    }
    let cancelled = false;
    const initialize = async () => {
      try {
        const google = await loadGoogleMaps(apiKey);
        const library = await google.maps.importLibrary('maps3d') as Maps3DLibrary;
        if (cancelled || !containerRef.current) return;
        const map = new library.Map3DElement({ center, range: cameraRange, tilt: 62, heading: 0, mode: 'HYBRID' });
        map.style.width = '100%';
        map.style.height = '100%';
        containerRef.current.replaceChildren(map);
        mapRef.current = map;
        actionOverlaysRef.current = createOverlayStore(
          (kind, options) => kind === 'polygon'
            ? new library.Polygon3DElement(options) : new library.Polyline3DElement(options),
          node => map.append(node as HTMLElement),
          toSurfacePath,
        );
        staticLayersRef.current = { routes: [], controlLines: [], objectives: [], unitLabels: new Map() };

        for (const track of result.unitTracks) {
          for (const segment of track.segments) {
            if (!['Move', 'Withdraw'].includes(segment.action) || segment.keyframes.length < 2) continue;
            const route = new library.Polyline3DElement({
              path: toSurfacePath(visibleRoutePositions(segment).map(position => ({ lat: position.latitude, lng: position.longitude }))),
              strokeColor: '#ffb95f', outerColor: '#121212', strokeWidth: 5, outerWidth: 0.3,
              altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: SURFACE_DRAWS_OCCLUDED_SEGMENTS,
            });
            staticLayersRef.current.routes.push({ node: route, startTime: segment.startTime, endTime: segment.endTime });
          }
        }

        for (const graphic of deployment?.tacticalGraphics ?? []) {
          const color = graphicColor(graphic);
          if (graphic.geometry.type === 'Polygon') {
            const path = toSurfacePath(graphic.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng })));
            const controlLine = new library.Polygon3DElement({
              path, fillColor: `${color}22`,
              strokeWidth: 0, altitudeMode: 'CLAMP_TO_GROUND', drawsOccludedSegments: false,
            });
            // Drape the boundary like phase lines; keep it visible through the
            // mesh without showing the translucent area fill through terrain.
            const boundary = new library.Polyline3DElement({
              path, strokeColor: color, strokeWidth: 3,
              altitudeMode: 'CLAMP_TO_GROUND', drawsOccludedSegments: true,
            });
            staticLayersRef.current.controlLines.push(controlLine, boundary);
            map.append(controlLine, boundary);
          } else if (graphic.type === 'phase-line') {
            const phaseLineNodes = createPhaseLineNodes(
              library,
              graphic.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
              graphic.name ?? 'Phase Line',
              4,
              { strokeColor: color },
            );
            staticLayersRef.current.controlLines.push(...phaseLineNodes);
            phaseLineNodes.forEach(node => map.append(node));
          } else {
            const controlLine = new library.Polyline3DElement({
              path: toSurfacePath(graphic.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))), strokeColor: color, strokeWidth: 4,
              outerColor: '#111827', outerWidth: 0.4,
              altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: SURFACE_DRAWS_OCCLUDED_SEGMENTS,
            });
            staticLayersRef.current.controlLines.push(controlLine);
            map.append(controlLine);
          }
        }

        const unitById = new Map(units.map(unit => [unit.id, unit]));
        for (const item of positionsAtTime(result, units, clock.current.simulationTime)) {
          const unit = unitById.get(item.unitId);
          if (!unit?.sidc) continue;
          const marker = new library.Marker3DInteractiveElement({
            position: { lat: item.position.latitude, lng: item.position.longitude },
            ...markerText(unit.name), sizePreserved: true, collisionBehavior: 'REQUIRED',
          });
          const template = document.createElement('template');
          template.innerHTML = createMilitarySymbolSvg(unit.sidc, get3DUnitSymbolSize(unit.symbolScale), undefined, unit.symbolStandard);
          marker.append(template);
          marker.addEventListener('gmp-click', () => onSelectUnit(unit.id));
          markersRef.current.set(unit.id, marker);
          staticLayersRef.current.unitLabels.set(marker, unit.name);
          map.append(marker);
        }
        refreshActionOverlays(clock.current.simulationTime);
        setReady(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Google 3D 지도를 초기화하지 못했습니다.');
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      markersRef.current.clear();
      staticLayersRef.current = { routes: [], controlLines: [], objectives: [], unitLabels: new Map() };
      actionOverlaysRef.current?.clear();
      actionOverlaysRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [cameraRange, center, clock, deployment, onSelectUnit, refreshActionOverlays, result, units]);

  useEffect(() => {
    const { routes, controlLines, objectives, unitLabels } = staticLayersRef.current;
    for (const route of routes) {
      const active = route.startTime <= runtime.simulationTime && runtime.simulationTime < route.endTime;
      if (runtime.tacticalLayers.routes && active) {
        if (!route.node.isConnected) mapRef.current?.append(route.node);
      } else if (route.node.isConnected) route.node.remove();
    }
    for (const node of controlLines) node.style.display = runtime.tacticalLayers.controlLines ? '' : 'none';
    for (const marker of objectives) marker.style.display = runtime.tacticalLayers.controlLines ? '' : 'none';
    for (const [marker, label] of unitLabels) marker.label = runtime.tacticalLayers.labels ? label : '';
  }, [ready, runtime.simulationTime, runtime.tacticalLayers]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let previousTime = Number.NaN;
    const shouldUpdate = createOverlaySchedule(ACTION_OVERLAY_INTERVAL_MS);
    const previousPositions = new Map<string, Position3D>();
    let lastFrameTime = Number.NaN;
    const tick = (timestamp: number) => {
      const time = clock.current.simulationTime;
      if (time !== previousTime) {
        for (const route of staticLayersRef.current.routes) {
          const active = clock.current.tacticalLayers.routes && route.startTime <= time && time < route.endTime;
          if (active) {
            if (!route.node.isConnected) mapRef.current?.append(route.node);
          } else if (route.node.isConnected) route.node.remove();
        }
        const positions = positionsAtTime(result, units, time);
        const visibleUnitIds = new Set(positions.map(item => item.unitId));
        for (const [unitId, marker] of markersRef.current) {
          const visible = visibleUnitIds.has(unitId);
          if (visible) {
            if (!marker.isConnected) mapRef.current?.append(marker);
          } else if (marker.isConnected) marker.remove();
        }
        for (const item of positions) {
          const marker = markersRef.current.get(item.unitId);
          const previous = previousPositions.get(item.unitId);
          if (marker && (previous?.lat !== item.position.latitude || previous?.lng !== item.position.longitude)) {
            const position = { lat: item.position.latitude, lng: item.position.longitude };
            marker.position = position;
            previousPositions.set(item.unitId, position);
          }
        }
        previousTime = time;
      }
      const jumped = Number.isFinite(lastFrameTime) && (time < lastFrameTime || time - lastFrameTime > 0.25);
      if (shouldUpdate(timestamp, time, clock.current.isPlaying, jumped)) {
        refreshActionOverlays(time);
      }
      lastFrameTime = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, ready, refreshActionOverlays, result, units]);

  useEffect(() => {
    for (const [unitId, marker] of markersRef.current) {
      marker.zIndex = unitId === runtime.selectedUnitId ? 100 : 1;
    }
  }, [runtime.selectedUnitId]);

  return (
    <section className="relative flex-1 overflow-hidden bg-[#101418]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-6 top-6 z-10 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur">GOOGLE 3D · ACTION PLAYBACK</div>
      {!ready && !error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90 text-sm text-on-surface-variant">Google 3D 지도를 불러오는 중입니다…</div>}
      {error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/95 p-6">
        <div className="max-w-xl rounded border border-error/50 bg-surface-container-high p-6 text-center">
          <p className="font-label-caps text-error">3D MAP UNAVAILABLE</p>
          <p className="mt-2 text-sm text-on-surface">{error}</p>
          <p className="mt-2 text-xs text-on-surface-variant">Google Cloud에서 Maps JavaScript API와 3D Maps를 활성화하고 환경 변수에 브라우저 제한 API 키를 입력해 주세요.</p>
        </div>
      </div>}
    </section>
  );
}
