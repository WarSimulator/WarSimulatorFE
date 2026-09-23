import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { AtomicActionEffect, DeploymentEditorMode, DeploymentObjective, DeploymentPaletteItem, DeploymentSetup, DeploymentUnit, ObservationEffect, SimulationResult, SimulationResultPosition, SimulationRuntimeState, SimulationUnit, TacticalGraphic, TacticalGraphicType } from '../../../types';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { graphicColor } from '../lib/graphicColor';
import { getLngLat } from '../lib/position';
import { getTrackPositionsAtTime, getUnitPositionAtTime, isUnitEliminated } from '../lib/playback';
import { buildObservationSector, getActiveObservationEffects } from '../lib/observation';
import { resolvePlanReference } from '../lib/planReferenceMapping';
import { createMilitarySymbolSvg, get3DUnitSymbolSize } from '../lib/symbolSvg';
import { createOverlayStore, createOverlaySchedule } from '../lib/google3DOverlayStore';
import { createGoogle3DTacticalVfxStore } from '../lib/google3DTacticalVfx';
import { scannerFillColor, scannerVisualForAffiliation } from '../lib/scannerVisual';
import { renderTacticalGraphic } from '../lib/renderTacticalGraphic';
import { createTaskGraphic, getTacticalTask } from '../lib/tacticalTasks';
import { AtomicActionPlaybackOverlay } from './AtomicActionPlaybackOverlay';
import { SymbolPalette } from './SymbolPalette';
import { UnitPropertiesPanel } from './UnitPropertiesPanel';
type ActionOverlayStore = ReturnType<typeof createOverlayStore>;

type LiveEdit = {
  units: DeploymentUnit[];
  objectives: DeploymentObjective[];
  tacticalGraphics: TacticalGraphic[];
  hiddenBaseUnitIds: string[];
  mode: DeploymentEditorMode;
  paletteOpen: boolean;
  selectedUnitId?: string;
  relocatingUnitId?: string;
  onModeChange: (mode: DeploymentEditorMode) => void;
  onTogglePalette: () => void;
  onPlaceUnit: (item: Extract<DeploymentPaletteItem, { kind: 'unit' }>, position: Position3D) => void;
  onPlaceObjective: (position: Position3D) => void;
  onAddGraphic: (graphic: TacticalGraphic) => void;
  onUpdateGraphic: (graphic: TacticalGraphic) => void;
  onSelectUnit: (unitId?: string) => void;
  onChangeDeployment: (deployment: DeploymentSetup) => void;
  onSetRelocatingUnit: (unitId?: string) => void;
  onMoveUnit: (unitId: string, position: Position3D) => void;
  onDeleteUnit: (unitId: string) => void;
};

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

export type Position3D = { lat: number; lng: number; altitude?: number };
export type Map3DNode = HTMLElement;
export type Marker3DNode = HTMLElement & { position: Position3D; label?: string; zIndex?: number };
type MapClickEvent = Event & { position?: Position3D };
type StaticLayerNodes = {
  routes: Array<{ node: HTMLElement; startTime: number; endTime: number }>;
  controlLines: HTMLElement[];
  objectives: Marker3DNode[];
  unitLabels: Map<Marker3DNode, string>;
};
export type Maps3DLibrary = {
  Map3DElement: new (options: Record<string, unknown>) => Map3DNode;
  Marker3DInteractiveElement: new (options: Record<string, unknown>) => Marker3DNode;
  Model3DElement: new (options: Record<string, unknown>) => HTMLElement & { position: Position3D };
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
const FIRE_ACTIONS = new Set(['Engage', 'Continue to Engage', 'Fight', 'Ambush', 'Disrupt', 'Destroy']);
const AREA_ACTIONS = new Set(['Establish Security', 'Establish Presence', 'Confirm Control', 'Contain', 'Block', 'Clear', 'Seize']);
const COMBAT_LINK_ALTITUDE_METERS = 600;
const DEMO_COMBAT_LINK_ALTITUDE_METERS = 80;
const LIVE_GRAPHIC_NAMES: Record<Exclude<TacticalGraphicType, 'mil-task'>, string> = {
  route: 'Route Alpha', axis: 'Axis Alpha', 'phase-line': 'PL RED', boundary: 'Boundary Alpha',
  area: 'Area Alpha', freehand: 'Freehand Alpha',
};
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
  const reference = [parameters.target, parameters.destination, parameters.recipient, parameters.effectArea, parameters.result]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return reference ? getUnitPositionAtTime(reference, time, result, deployment) ?? resolvePlanReference(deployment, reference) : undefined;
}

function actionAreaPath(effect: AtomicActionEffect, deployment?: DeploymentSetup): Position3D[] | undefined {
  const reference = effect.parameters.target ?? effect.parameters.effectArea;
  if (typeof reference !== 'string') return undefined;
  const graphic = deployment?.tacticalGraphics.find(item => item.id === reference || item.name === reference);
  if (graphic?.geometry.type !== 'Polygon') return undefined;
  const points = graphic.geometry.coordinates[0];
  return points.length >= 3 ? points.map(([lng, lat]) => ({ lat, lng })) : undefined;
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
  linkAltitude = COMBAT_LINK_ALTITUDE_METERS,
) {
  const color = actionColor(action);
  const pulseCenter = target ?? origin;
  if (target && (target.lat !== origin.lat || target.lng !== origin.lng)) {
    const combatLink = FIRE_ACTIONS.has(action);
    const path = combatLink
      ? [
        { ...origin, altitude: 0 },
        { ...origin, altitude: linkAltitude },
        { ...target, altitude: linkAltitude },
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
  atomicActionVisuals = false,
) {
  nodes.begin();
  const activeObservations = getActiveObservationEffects(result, time);
  const observationSequences = new Set(activeObservations.map(effect => effect.actionSequence));
  activeObservations.forEach(effect => addObservationAction(nodes, `observe:${effect.actor}:${effect.actionSequence}`, effect, result, deployment, time));

  for (const effect of result.actionEffects ?? []) {
    if (effect.startTime > time || time >= effect.endTime || (effect.action === 'Observe' && observationSequences.has(effect.actionSequence))) continue;
    // Move and Withdraw use their timed route geometry; Observe uses its sensor sector.
    if (atomicActionVisuals && (effect.action === 'Move' || effect.action === 'Withdraw' || effect.action === 'Observe')) continue;
    const origin = getUnitPositionAtTime(effect.unitId, time, result, deployment)
      ?? getUnitPositionAtTime(effect.actor, time, result, deployment)
      ?? effect.origin;
    const target = actionTarget(effect, result, deployment, time);
    const progress = Math.max(0, Math.min(1, (time - effect.startTime) / Math.max(0.01, effect.endTime - effect.startTime)));
    const key = `action:${effect.unitId}:${effect.actionSequence}`;
    const areaPath = atomicActionVisuals && AREA_ACTIONS.has(effect.action) ? actionAreaPath(effect, deployment) : undefined;
    if (areaPath) {
      const color = actionColor(effect.action);
      const fillAlpha = Math.round((.04 + .16 * progress) * 255).toString(16).padStart(2, '0');
      nodes.put(`${key}:area`, 'polygon', {
        path: areaPath, fillColor: `${color}${fillAlpha}`, strokeColor: color, strokeWidth: 4,
        altitudeMode: 'CLAMP_TO_GROUND', drawsOccludedSegments: true, zIndex: 31,
      });
      if (effect.action === 'Seize' && target) {
        nodes.put(`${key}:approach`, 'line', {
          path: [position3D(origin), position3D(target)], strokeColor: color, strokeWidth: 4,
          altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: false, zIndex: 30,
        });
      }
    } else {
      addDirectedAction(nodes, key, effect.action, position3D(origin), target ? position3D(target) : undefined, progress,
        atomicActionVisuals ? DEMO_COMBAT_LINK_ALTITUDE_METERS : COMBAT_LINK_ALTITUDE_METERS);
    }
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

function axisArrowCoordinates(points: number[][], scale: number): number[][] | undefined {
  if (points.length < 2) return undefined;
  const tip = points[points.length - 1], previous = points[points.length - 2];
  const cos = Math.cos(tip[1] * Math.PI / 180);
  const dx = (tip[0] - previous[0]) * cos, dy = tip[1] - previous[1];
  const length = Math.hypot(dx, dy);
  if (length === 0 || Math.abs(cos) < 0.0001) return undefined;
  const size = Math.min(length * 0.3, scale * 0.003 / 111000);
  const wing = (sign: number) => [tip[0] + (-dx + sign * dy * 0.55) / length * size / cos, tip[1] + (-dy - sign * dx * 0.55) / length * size];
  return [wing(1), tip, wing(-1)];
}

function anchoredAxisCoordinates(graphic: TacticalGraphic, editor: LiveEdit | undefined, time: number, result: SimulationResult, deployment?: DeploymentSetup): [number, number][] {
  if (graphic.geometry.type !== 'LineString') return [];
  const points = graphic.geometry.coordinates;
  if (!graphic.sourceUnitId || points.length < 2) return points;
  const editedUnit = editor?.units.find(unit => unit.id === graphic.sourceUnitId);
  const source = editedUnit ? getLngLat(editedUnit.position) : (() => {
    const position = getUnitPositionAtTime(graphic.sourceUnitId!, time, result, deployment);
    return position ? [position.longitude, position.latitude] as [number, number] : undefined;
  })();
  return source ? [source, ...points.slice(1)] : points;
}

export function Google3DTacticalMap({ runtime, playbackRef, units, result, deployment, onSelectUnit, atomicActionVisuals = false, liveEdit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DNode | null>(null);
  const libraryRef = useRef<Maps3DLibrary | null>(null);
  const markersRef = useRef(new Map<string, Marker3DNode>());
  const liveMarkersRef = useRef(new Map<string, Marker3DNode>());
  const liveGraphicsRef = useRef<HTMLElement[]>([]);
  const liveEditRef = useRef(liveEdit);
  const drawPointsRef = useRef<[number, number][]>([]);
  const axisSourceUnitIdRef = useRef<string | undefined>(undefined);
  const axisNodesRef = useRef(new Map<string, { line: HTMLElement; arrow: HTMLElement; graphic: TacticalGraphic; start?: [number, number] }>());
  const editingVertexRef = useRef<number | undefined>(undefined);
  const finishDrawingRef = useRef<() => void>(() => {});
  const deleteEditingVertexRef = useRef<() => void>(() => {});
  const [drawPointCount, setDrawPointCount] = useState(0);
  const [editingVertex, setEditingVertex] = useState<number>();
  const [graphicError, setGraphicError] = useState('');
  const [taskScale, setTaskScale] = useState(100000);
  const staticLayersRef = useRef<StaticLayerNodes>({ routes: [], controlLines: [], objectives: [], unitLabels: new Map() });
  const actionOverlaysRef = useRef<ActionOverlayStore | null>(null);
  const tacticalVfxRef = useRef<ReturnType<typeof createGoogle3DTacticalVfxStore> | null>(null);
  const fallbackPlaybackRef = useRef(runtime);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const center = useMemo(() => getCenter(result, deployment), [deployment, result]);
  const cameraRange = useMemo(() => getCameraRange(result, center), [center, result]);
  useEffect(() => { fallbackPlaybackRef.current = runtime; }, [runtime]);
  useEffect(() => { liveEditRef.current = liveEdit; }, [liveEdit]);
  useEffect(() => {
    drawPointsRef.current = [];
    axisSourceUnitIdRef.current = undefined;
    setDrawPointCount(0);
    editingVertexRef.current = undefined;
    setEditingVertex(undefined);
    setGraphicError('');
  }, [liveEdit?.mode.type, liveEdit?.mode.type === 'draw' ? liveEdit.mode.graphicType : liveEdit?.mode.type === 'draw-task' ? liveEdit.mode.definitionId : liveEdit?.mode.type === 'append-geometry' ? liveEdit.mode.graphicId : undefined]);

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
        if (editor.mode.graphicType === 'axis' && (!axisSourceUnitIdRef.current || points.length !== 2)) return;
        graphic = {
          id: `graphic-${crypto.randomUUID()}`, type: editor.mode.graphicType, name: LIVE_GRAPHIC_NAMES[editor.mode.graphicType],
          ...(editor.mode.graphicType === 'axis' ? { sourceUnitId: axisSourceUnitIdRef.current } : {}),
          geometry: editor.mode.graphicType === 'area'
            ? { type: 'Polygon', coordinates: [[...points, points[0]]] }
            : { type: 'LineString', coordinates: points },
        };
      }
    } catch (caught) {
      setGraphicError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    if (!graphic) return;
    editor.onAddGraphic(graphic);
    setGraphicError('');
  };
  finishDrawingRef.current = finishDrawing;
  const selectAxisSource = (unitId: string, position: Position3D) => {
    const mode = liveEditRef.current?.mode;
    if (mode?.type !== 'draw' || mode.graphicType !== 'axis' || drawPointsRef.current.length !== 0) return false;
    if (!Number.isFinite(position.lng) || !Number.isFinite(position.lat)) return false;
    axisSourceUnitIdRef.current = unitId;
    drawPointsRef.current = [[position.lng, position.lat]];
    setDrawPointCount(1);
    return true;
  };
  const deleteEditingVertex = () => {
    const editor = liveEditRef.current;
    const mode = editor?.mode;
    if (!editor || mode?.type !== 'append-geometry' || editingVertex === undefined) return;
    const graphic = editor.tacticalGraphics.find(item => item.id === mode.graphicId);
    if (!graphic) return;
    const task = getTacticalTask(graphic.tacticalSymbol?.definitionId);
    const minimum = task?.minPoints ?? (graphic.geometry.type === 'Polygon' ? 3 : 2);
    if (graphic.geometry.type === 'Polygon') {
      const points = graphic.geometry.coordinates[0].slice(0, -1);
      if (points.length <= minimum) return;
      const next = points.filter((_, index) => index !== editingVertex);
      editor.onUpdateGraphic({ ...graphic, geometry: { type: 'Polygon', coordinates: [[...next, next[0]]] } });
    } else {
      if (graphic.geometry.coordinates.length <= minimum) return;
      editor.onUpdateGraphic({ ...graphic, geometry: { type: 'LineString', coordinates: graphic.geometry.coordinates.filter((_, index) => index !== editingVertex) } });
    }
    editingVertexRef.current = undefined;
    setEditingVertex(undefined);
  };
  deleteEditingVertexRef.current = deleteEditingVertex;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editor = liveEditRef.current;
      if (!editor || (event.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (event.key === 'Enter' && (editor.mode.type === 'draw' || editor.mode.type === 'draw-task')) {
        event.preventDefault(); finishDrawingRef.current();
      } else if (event.key === 'Backspace' && (editor.mode.type === 'draw' || editor.mode.type === 'draw-task')) {
        event.preventDefault(); drawPointsRef.current = drawPointsRef.current.slice(0, -1);
        if (!drawPointsRef.current.length) axisSourceUnitIdRef.current = undefined;
        setDrawPointCount(drawPointsRef.current.length);
      } else if (event.key === 'Escape') {
        editor.onSelectUnit(undefined); editor.onModeChange({ type: 'select' });
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && editor.mode.type === 'append-geometry' && editingVertexRef.current !== undefined) {
        event.preventDefault(); deleteEditingVertexRef.current();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && editor.mode.type === 'select' && editor.selectedUnitId) {
        event.preventDefault(); editor.onDeleteUnit(editor.selectedUnitId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const clock = playbackRef ?? fallbackPlaybackRef;
  const refreshActionOverlays = useCallback((time: number) => {
    if (!actionOverlaysRef.current) return;
    updateActionOverlays(actionOverlaysRef.current, result, deployment, time, atomicActionVisuals);
  }, [atomicActionVisuals, deployment, result]);

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
        map.addEventListener('gmp-steadychange', () => {
          const range = (map as Map3DNode & { range?: number }).range ?? cameraRange;
          const scale = Math.max(1000, range * 2 * Math.tan(Math.PI / 8) / Math.max(containerRef.current?.clientHeight ?? 600, 1) * (96 / 0.0254));
          setTaskScale(previous => Math.abs(previous - scale) / previous > 0.1 ? scale : previous);
        });
        map.style.width = '100%';
        map.style.height = '100%';
        map.addEventListener('gmp-click', event => {
          const editor = liveEditRef.current;
          const position = (event as MapClickEvent).position;
          if (!editor || !position || !Number.isFinite(position.lng) || !Number.isFinite(position.lat)) return;
          if (editor.relocatingUnitId) {
            editor.onMoveUnit(editor.relocatingUnitId, position);
          } else if (editor.mode.type === 'place') {
            if (editor.mode.item.kind === 'unit') editor.onPlaceUnit(editor.mode.item, position);
            else editor.onPlaceObjective(position);
          } else if (editor.mode.type === 'draw' || editor.mode.type === 'draw-task') {
            if (editor.mode.type === 'draw' && editor.mode.graphicType === 'axis') {
              if (!axisSourceUnitIdRef.current || drawPointsRef.current.length !== 1) return;
              const [sourceLng, sourceLat] = drawPointsRef.current[0];
              if (Math.hypot((position.lng - sourceLng) * Math.cos(sourceLat * Math.PI / 180), position.lat - sourceLat) < 0.000001) {
                setGraphicError('출발 유닛과 다른 도착 지점을 선택하세요.');
                return;
              }
              setGraphicError('');
              drawPointsRef.current = [drawPointsRef.current[0], [position.lng, position.lat]];
              setDrawPointCount(2);
              finishDrawingRef.current();
              return;
            }
            drawPointsRef.current = [...drawPointsRef.current, [position.lng, position.lat]];
            setDrawPointCount(drawPointsRef.current.length);
            if (editor.mode.type === 'draw-task') {
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
              const updated = selectedVertex === undefined ? [...vertices, point] : vertices.map((item, index) => index === selectedVertex ? point : item);
              editor.onUpdateGraphic({ ...graphic, geometry: { type: 'Polygon', coordinates: [[...updated, updated[0]]] } });
            } else {
              const points = selectedVertex === undefined ? [...graphic.geometry.coordinates, point] : graphic.geometry.coordinates.map((item, index) => index === selectedVertex ? point : item);
              const task = getTacticalTask(graphic.tacticalSymbol?.definitionId);
              if (!task || points.length <= task.maxPoints) editor.onUpdateGraphic({ ...graphic, geometry: { type: 'LineString', coordinates: points } });
            }
            editingVertexRef.current = undefined;
            setEditingVertex(undefined);
          } else if (editor.mode.type === 'select') {
            editor.onSelectUnit(undefined);
          }
        });
        containerRef.current.replaceChildren(map);
        mapRef.current = map;
        libraryRef.current = library;
        actionOverlaysRef.current = createOverlayStore(
          (kind, options) => kind === 'polygon'
            ? new library.Polygon3DElement(options) : new library.Polyline3DElement(options),
          node => map.append(node as HTMLElement),
          toSurfacePath,
        );
        tacticalVfxRef.current = createGoogle3DTacticalVfxStore(library, map, result, deployment);
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
          marker.addEventListener('gmp-click', event => {
            event.stopPropagation();
            if (selectAxisSource(unit.id, marker.position)) return;
            if (liveEditRef.current) liveEditRef.current.onSelectUnit(unit.id);
            onSelectUnit(unit.id);
          });
          markersRef.current.set(unit.id, marker);
          staticLayersRef.current.unitLabels.set(marker, unit.name);
          map.append(marker);
        }
        refreshActionOverlays(clock.current.simulationTime);
        tacticalVfxRef.current.update(clock.current.simulationTime);
        setReady(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Google 3D 지도를 초기화하지 못했습니다.');
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      markersRef.current.clear();
      liveMarkersRef.current.forEach(marker => marker.remove());
      liveMarkersRef.current.clear();
      libraryRef.current = null;
      staticLayersRef.current = { routes: [], controlLines: [], objectives: [], unitLabels: new Map() };
      actionOverlaysRef.current?.clear();
      actionOverlaysRef.current = null;
      tacticalVfxRef.current?.clear();
      tacticalVfxRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [cameraRange, center, clock, deployment, onSelectUnit, refreshActionOverlays, result, units]);

  useEffect(() => {
    liveMarkersRef.current.forEach(marker => marker.remove());
    liveMarkersRef.current.clear();
    const map = mapRef.current;
    const library = libraryRef.current;
    if (!ready || !map || !library || !liveEdit) return;
    for (const unit of liveEdit.units) {
      const [lng, lat] = getLngLat(unit.position);
      const selected = unit.id === liveEdit.selectedUnitId;
      const marker = new library.Marker3DInteractiveElement({
        position: { lng, lat, altitude: 5 }, altitudeMode: SURFACE_ALTITUDE_MODE,
        drawsWhenOccluded: true, sizePreserved: true, collisionBehavior: 'REQUIRED', zIndex: selected ? 210 : 110,
        ...markerText(runtime.tacticalLayers.labels ? unit.designation : undefined),
      });
      const template = document.createElement('template');
      template.innerHTML = createMilitarySymbolSvg(unit.sidc, get3DUnitSymbolSize(unit.symbolScale) + (selected ? 10 : 0), undefined, unit.symbolStandard);
      marker.append(template);
      if (liveEdit.relocatingUnitId || (liveEdit.mode.type !== 'select' && !(liveEdit.mode.type === 'draw' && liveEdit.mode.graphicType === 'axis' && drawPointCount === 0))) marker.style.pointerEvents = 'none';
      marker.addEventListener('gmp-click', event => {
        event.stopPropagation();
        if (selectAxisSource(unit.id, marker.position)) return;
        liveEditRef.current?.onSelectUnit(unit.id);
      });
      liveMarkersRef.current.set(unit.id, marker);
      map.append(marker);
    }
    return () => {
      liveMarkersRef.current.forEach(marker => marker.remove());
      liveMarkersRef.current.clear();
    };
  }, [ready, liveEdit?.units, liveEdit?.selectedUnitId, liveEdit?.relocatingUnitId, liveEdit?.mode, runtime.tacticalLayers.labels, drawPointCount]);

  useEffect(() => {
    liveGraphicsRef.current.forEach(node => node.remove());
    liveGraphicsRef.current = [];
    axisNodesRef.current.clear();
    const map = mapRef.current;
    const library = libraryRef.current;
    if (!ready || !map || !library || !liveEdit) return;
    const append = (node: HTMLElement, id?: string) => {
      if (id && liveEdit.mode.type === 'select') node.addEventListener('gmp-click', event => {
        event.stopPropagation();
        liveEditRef.current?.onSelectUnit(id);
      });
      else node.style.pointerEvents = 'none';
      liveGraphicsRef.current.push(node);
      map.append(node);
    };
    const surfacePath = (coordinates: number[][]) => toSurfacePath(coordinates.map(([lng, lat]) => ({ lng, lat })))
      .map(point => ({ ...point, altitude: 3 }));
    const pointMarker = (point: number[], label: string, color = '#ffb95f') => {
      const marker = new library.Marker3DInteractiveElement({
        position: { lng: point[0], lat: point[1], altitude: 5 }, altitudeMode: SURFACE_ALTITUDE_MODE,
        drawsWhenOccluded: true, sizePreserved: true, zIndex: 160,
      });
      const template = document.createElement('template');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(Math.max(36, label.length * 15 + 16)));
      svg.setAttribute('height', '32');
      const text = document.createElementNS(svg.namespaceURI, 'text');
      text.setAttribute('x', '50%'); text.setAttribute('y', '23'); text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '17'); text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', color); text.setAttribute('stroke', '#111827');
      text.setAttribute('stroke-width', '4'); text.setAttribute('paint-order', 'stroke');
      text.textContent = label;
      svg.append(text); template.content.append(svg);
      marker.append(template);
      return marker;
    };
    for (const objective of liveEdit.objectives) {
      const [lng, lat] = getLngLat(objective.position);
      const marker = pointMarker([lng, lat], `OBJ · ${objective.name}`, '#80d8ff');
      append(marker, objective.id);
    }
    for (const graphic of liveEdit.tacticalGraphics) {
      const selected = graphic.id === liveEdit.selectedUnitId;
      const color = graphicColor(graphic);
      const Line = liveEdit.mode.type === 'select' ? library.Polyline3DInteractiveElement : library.Polyline3DElement;
      const Polygon = liveEdit.mode.type === 'select' ? library.Polygon3DInteractiveElement : library.Polygon3DElement;
      try {
        if (graphic.type === 'mil-task') {
          const task = getTacticalTask(graphic.tacticalSymbol?.definitionId);
          const taskColor = graphic.tacticalSymbol?.affiliation === 'enemy' ? '#ff7777' : '#80d8ff';
          if (task?.minPoints === 1 && task.maxPoints === 1 && graphic.geometry.type === 'LineString') {
            const [lng, lat] = graphic.geometry.coordinates[0];
            const marker = new library.Marker3DInteractiveElement({ position: { lng, lat, altitude: 5 }, altitudeMode: SURFACE_ALTITUDE_MODE, drawsWhenOccluded: true, sizePreserved: true, zIndex: selected ? 180 : 120 });
            const template = document.createElement('template');
            template.innerHTML = createMilitarySymbolSvg(graphic.tacticalSymbol!.sidc, selected ? 58 : 48);
            marker.append(template);
            append(marker, graphic.id);
          } else {
            for (const feature of renderTacticalGraphic(graphic, taskScale)) {
              const geometry = feature.geometry;
              const line = (points: number[][]) => append(new Line({ path: surfacePath(points), altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: true, strokeColor: taskColor, strokeWidth: selected ? 7 : 4, outerColor: '#111827', outerWidth: 0.4 }), graphic.id);
              if (geometry.type === 'LineString') line(geometry.coordinates);
              else if (geometry.type === 'MultiLineString') geometry.coordinates.forEach(line);
              else if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
                const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
                for (const rings of polygons) {
                  append(new Polygon({ path: surfacePath(rings[0]), altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: true, fillColor: `${taskColor}55`, strokeColor: taskColor, strokeWidth: selected ? 7 : 4 }), graphic.id);
                  rings.forEach(line);
                }
              } else if (geometry.type === 'Point' && feature.properties?.label) append(pointMarker(geometry.coordinates, String(feature.properties.label), taskColor), graphic.id);
            }
          }
          continue;
        }
        if (graphic.type === 'phase-line' && graphic.geometry.type === 'LineString') {
          createPhaseLineNodes(library, graphic.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })), graphic.name ?? 'Phase Line', selected ? 7 : 4, { interactive: liveEdit.mode.type === 'select', strokeColor: color }).forEach(node => append(node, graphic.id));
          continue;
        }
        const common = { altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: true, strokeColor: color, strokeWidth: selected ? 7 : 4 };
        const lineCoordinates = graphic.type === 'axis' ? anchoredAxisCoordinates(graphic, liveEdit, runtime.simulationTime, result, deployment) : graphic.geometry.type === 'LineString' ? graphic.geometry.coordinates : [];
        const node = graphic.geometry.type === 'Polygon'
          ? new Polygon({ ...common, path: surfacePath(graphic.geometry.coordinates[0]), fillColor: '#00000000' })
          : new Line({ ...common, path: surfacePath(lineCoordinates), outerColor: '#111827', outerWidth: 0.4 });
        append(node, graphic.id);
        if (graphic.type === 'axis' && lineCoordinates.length >= 2) {
          const arrowCoordinates = axisArrowCoordinates(lineCoordinates, taskScale);
          if (arrowCoordinates) {
            const arrow = new Line({ ...common, path: surfacePath(arrowCoordinates), outerColor: '#111827', outerWidth: 0.4 });
            append(arrow, graphic.id);
            if (graphic.sourceUnitId) axisNodesRef.current.set(graphic.id, { line: node, arrow, graphic, start: lineCoordinates[0] });
          }
        }
      } catch (caught) {
        setGraphicError(caught instanceof Error ? caught.message : String(caught));
      }
    }
    if (liveEdit.mode.type === 'draw' || liveEdit.mode.type === 'draw-task') {
      const points = drawPointsRef.current;
      points.forEach((point, index) => append(pointMarker(point, `● ${index + 1}`)));
      if (points.length >= 2) append(new library.Polyline3DElement({ path: surfacePath(points), altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: true, strokeColor: '#ffb95f', strokeWidth: 5 }));
      if (liveEdit.mode.type === 'draw' && liveEdit.mode.graphicType === 'area' && points.length >= 3) append(new library.Polygon3DElement({ path: surfacePath([...points, points[0]]), altitudeMode: SURFACE_ALTITUDE_MODE, drawsOccludedSegments: true, fillColor: '#00000000', strokeColor: '#ffb95f', strokeWidth: 4 }));
    }
    if (liveEdit.mode.type === 'append-geometry') {
      const graphicId = liveEdit.mode.graphicId;
      const graphic = liveEdit.tacticalGraphics.find(item => item.id === graphicId);
      const points = graphic?.geometry.type === 'Polygon' ? graphic.geometry.coordinates[0].slice(0, -1) : graphic?.type === 'axis' ? anchoredAxisCoordinates(graphic, liveEdit, runtime.simulationTime, result, deployment) : graphic?.geometry.coordinates ?? [];
      points.forEach((point, index) => {
        const anchoredStart = graphic?.type === 'axis' && Boolean(graphic.sourceUnitId) && index === 0;
        const marker = pointMarker(point, anchoredStart ? 'UNIT' : String(index + 1), index === editingVertex ? '#ffb95f' : '#ffffff');
        if (anchoredStart) marker.style.pointerEvents = 'none';
        else marker.addEventListener('gmp-click', event => { event.stopPropagation(); editingVertexRef.current = index; setEditingVertex(index); });
        liveGraphicsRef.current.push(marker);
        map.append(marker);
      });
    }
    return () => { liveGraphicsRef.current.forEach(node => node.remove()); liveGraphicsRef.current = []; axisNodesRef.current.clear(); };
  }, [ready, liveEdit?.units, liveEdit?.objectives, liveEdit?.tacticalGraphics, liveEdit?.selectedUnitId, liveEdit?.mode, drawPointCount, editingVertex, taskScale]);

  useEffect(() => {
    const replacedIds = new Set(liveEdit?.units.map(unit => unit.id) ?? []);
    const hiddenIds = new Set(liveEdit?.hiddenBaseUnitIds ?? []);
    for (const [id, marker] of markersRef.current) {
      marker.style.display = replacedIds.has(id) || hiddenIds.has(id) ? 'none' : '';
      const axisAwaitingUnit = liveEdit?.mode.type === 'draw' && liveEdit.mode.graphicType === 'axis' && drawPointCount === 0;
      marker.style.pointerEvents = liveEdit && (liveEdit.relocatingUnitId || (liveEdit.mode.type !== 'select' && !axisAwaitingUnit)) ? 'none' : '';
    }
  }, [ready, liveEdit?.units, liveEdit?.hiddenBaseUnitIds, liveEdit?.relocatingUnitId, liveEdit?.mode, drawPointCount]);

  useEffect(() => {
    if (mapRef.current) mapRef.current.style.cursor = liveEdit?.mode.type === 'place' || liveEdit?.mode.type === 'draw' || liveEdit?.mode.type === 'draw-task' || liveEdit?.relocatingUnitId ? 'crosshair' : '';
  }, [liveEdit?.mode, liveEdit?.relocatingUnitId, ready]);

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
        for (const entry of axisNodesRef.current.values()) {
          const coordinates = anchoredAxisCoordinates(entry.graphic, liveEditRef.current, time, result, deployment);
          const start = coordinates[0];
          if (!start || (entry.start?.[0] === start[0] && entry.start?.[1] === start[1])) continue;
          const surfacePath = (points: number[][]) => toSurfacePath(points.map(([lng, lat]) => ({ lng, lat }))).map(point => ({ ...point, altitude: 3 }));
          Object.assign(entry.line, { path: surfacePath(coordinates) });
          const arrow = axisArrowCoordinates(coordinates, taskScale);
          entry.arrow.style.display = arrow ? '' : 'none';
          if (arrow) Object.assign(entry.arrow, { path: surfacePath(arrow) });
          entry.start = start;
        }
        previousTime = time;
      }
      const jumped = Number.isFinite(lastFrameTime) && (time < lastFrameTime || time - lastFrameTime > 0.25);
      if (shouldUpdate(timestamp, time, clock.current.isPlaying, jumped)) {
        refreshActionOverlays(time);
        tacticalVfxRef.current?.update(time);
      }
      lastFrameTime = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, deployment, ready, refreshActionOverlays, result, taskScale, units]);

  useEffect(() => {
    for (const [unitId, marker] of markersRef.current) {
      marker.zIndex = unitId === runtime.selectedUnitId ? 100 : 1;
    }
  }, [runtime.selectedUnitId]);

  const editingGraphicId = liveEdit?.mode.type === 'append-geometry' ? liveEdit.mode.graphicId : undefined;
  const editingGraphic = liveEdit?.tacticalGraphics.find(graphic => graphic.id === editingGraphicId);
  const editingPointCount = editingGraphic?.geometry.type === 'Polygon' ? editingGraphic.geometry.coordinates[0].length - 1 : editingGraphic?.geometry.coordinates.length ?? 0;
  const editingMinimumPoints = editingGraphic ? getTacticalTask(editingGraphic.tacticalSymbol?.definitionId)?.minPoints ?? (editingGraphic.geometry.type === 'Polygon' ? 3 : 2) : 0;
  const minimumDrawPoints = liveEdit?.mode.type === 'draw' ? liveEdit.mode.graphicType === 'area' ? 3 : 2 : liveEdit?.mode.type === 'draw-task' ? getTacticalTask(liveEdit.mode.definitionId)?.minPoints ?? Infinity : Infinity;
  const selectedMovable = Boolean(liveEdit?.selectedUnitId && (liveEdit.units.some(unit => unit.id === liveEdit.selectedUnitId) || deployment?.units.some(unit => unit.id === liveEdit.selectedUnitId) || liveEdit.objectives.some(objective => objective.id === liveEdit.selectedUnitId)));
  return (
    <section className="relative flex-1 overflow-hidden bg-[#101418]" style={liveEdit ? { '--palette-width': 'min(760px, calc(100vw - 32px))' } as CSSProperties : undefined}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className={`pointer-events-none absolute z-10 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur ${liveEdit ? 'left-4 top-[72px]' : 'left-6 top-6'}`}>GOOGLE 3D · {liveEdit ? 'LIVE EDIT' : 'ACTION PLAYBACK'}</div>
      {atomicActionVisuals && ready && <AtomicActionPlaybackOverlay result={result} deployment={deployment} simulationTime={runtime.simulationTime} selectedUnitId={runtime.selectedUnitId} onSelectUnit={onSelectUnit} />}
      {liveEdit && <>
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
          <span className="rounded border border-outline-variant bg-surface/90 px-3 py-2 font-data-mono text-xs text-on-surface">{liveEdit.mode.type === 'draw' && liveEdit.mode.graphicType === 'axis' ? drawPointCount === 0 ? 'Axis · 출발 유닛을 클릭하세요' : 'Axis · 도착 지점을 클릭하세요' : `기준점 ${drawPointCount}개`}</span>
          <button type="button" disabled={!drawPointCount} className="rounded bg-surface/90 px-3 py-2 text-xs text-on-surface disabled:opacity-40" onClick={() => { drawPointsRef.current = drawPointsRef.current.slice(0, -1); if (!drawPointsRef.current.length) axisSourceUnitIdRef.current = undefined; setDrawPointCount(drawPointsRef.current.length); }}>마지막 점 취소</button>
          <button type="button" disabled={drawPointCount < minimumDrawPoints} className="rounded bg-secondary px-3 py-2 text-xs text-on-secondary disabled:opacity-40" onClick={finishDrawing}>그리기 완료</button>
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
