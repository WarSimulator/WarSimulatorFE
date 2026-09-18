import type {
  AtomicActionEffect,
  DeploymentAffiliation,
  DeploymentEchelon,
  DeploymentSetup,
  DeploymentUnit,
  ExpandedDeploymentUnitType,
  ObservationEffect,
  SimulationResult,
  SimulationResultEvent,
  SimulationResultPosition,
  SimulationTrackSegment,
  SimulationUnitTrack,
} from '../../../types';
import { createSidc } from './sidc';
import { ForcePlanError, parseForcePlan, type ImportedStep, type PlanIssue } from './forcePlan';

const STORAGE_KEY = 'atlas-defense.simulation-final-runs';
const MAX_ROUTE_KEYFRAMES = 160;

type JsonObject = Record<string, unknown>;

type StoredFinalRun = {
  result: SimulationResult;
  deployment: DeploymentSetup;
  planCounts: { blueForce: number; redForce: number; withdrawal: number };
};

export type FinalSimulationInputs = {
  blueForce: unknown;
  redForce: unknown;
  withdrawal?: unknown;
  deployment: unknown;
};

export type FinalSimulationBuild = StoredFinalRun & { simulationId: string };

const actionNames: Record<string, string> = {
  move: 'Move', observe: 'Observe', engage: 'Engage', continue_to_engage: 'Continue to Engage',
  establish_security: 'Establish Security', establish_presence: 'Establish Presence', confirm: 'Confirm',
  confirm_control: 'Confirm Control', construct: 'Construct', adapt: 'Adapt', decide: 'Decide',
  re_orient: 'Re-Orient', reorient: 'Re-Orient', adjust: 'Adjust', demonstrate: 'Demonstrate',
  integrate: 'Integrate', contain: 'Contain', block: 'Block', report: 'Report', identify: 'Identify',
  fight: 'Fight', withdraw: 'Withdraw', do_not_seek_a_decisive_engagement: 'Do Not Seek a Decisive Engagement',
  disassemble_disarm: 'Disassemble/Disarm', ambush: 'Ambush', breach: 'Breach', clear: 'Clear',
  seize: 'Seize', disrupt: 'Disrupt', destroy: 'Destroy',
};

const visualizationIds: Record<string, string> = {
  'Continue to Engage': 'continue_to_engage', 'Establish Security': 'establish_security',
  'Establish Presence': 'establish_presence', 'Confirm Control': 'confirm_control', 'Re-Orient': 're_orient',
  'Do Not Seek a Decisive Engagement': 'do_not_seek_a_decisive_engagement',
  'Disassemble/Disarm': 'disassemble_disarm',
};

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 파일의 최상위 값은 JSON 객체여야 합니다.`);
  return value as JsonObject;
}

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function position(value: unknown): SimulationResultPosition | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as JsonObject;
  const longitude = finite(item.longitude ?? item.lon, Number.NaN);
  const latitude = finite(item.latitude ?? item.lat, Number.NaN);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : undefined;
}

function planSteps(payload: unknown, label: string): ImportedStep[] {
  const root = object(payload, label);
  if (root.complete === false) throw new Error(`${label} 계획이 complete=false 상태입니다.`);
  const temporal = root.temporal_plan && typeof root.temporal_plan === 'object' ? root.temporal_plan as JsonObject : undefined;
  const candidates = temporal?.steps ?? root.actions ?? root.steps;
  if (!Array.isArray(candidates)) throw new Error(`${label} 파일에서 temporal_plan.steps 또는 actions 배열을 찾을 수 없습니다.`);
  return candidates.map((value, index) => ({ ...object(value, `${label} ${index + 1}번 행동`) } as ImportedStep));
}

function normalizeAffiliation(value: unknown): DeploymentAffiliation {
  return String(value).toLowerCase() === 'red' || String(value).toLowerCase().includes('hostile') || String(value).toLowerCase().includes('enemy') ? 'enemy' : 'friendly';
}

function normalizeType(value: unknown): ExpandedDeploymentUnitType {
  const raw = String(value ?? 'infantry').toLowerCase().replace(/[ -]+/g, '_');
  const aliases: Record<string, ExpandedDeploymentUnitType> = { mechanized: 'mechanized_infantry', tank: 'armor', cavalry: 'recon', fires: 'artillery' };
  return aliases[raw] ?? raw as ExpandedDeploymentUnitType;
}

function normalizeEchelon(value: unknown): DeploymentEchelon {
  const raw = String(value ?? 'company').toLowerCase().replace(/[ -]+/g, '_');
  const allowed: DeploymentEchelon[] = ['fireteam', 'squad', 'section', 'platoon', 'company', 'battalion', 'regiment', 'brigade', 'division', 'corps', 'army', 'army_group', 'theater'];
  return allowed.includes(raw as DeploymentEchelon) ? raw as DeploymentEchelon : 'company';
}

function normalizeDeployment(payload: unknown): DeploymentSetup {
  const root = object(payload, '유닛 배치 데이터');
  if (!Array.isArray(root.units) || root.units.length === 0) throw new Error('유닛 배치 데이터에는 하나 이상의 units가 필요합니다.');
  const fallbackCenter: [number, number] = [126.71, 37.625];
  const mapView = root.mapView && typeof root.mapView === 'object' ? root.mapView as JsonObject : undefined;
  const center = Array.isArray(mapView?.center) && mapView.center.length >= 2
    ? [finite(mapView.center[0], fallbackCenter[0]), finite(mapView.center[1], fallbackCenter[1])] as [number, number]
    : fallbackCenter;

  const units: DeploymentUnit[] = root.units.map((raw, index) => {
    const unit = object(raw, `units[${index}]`);
    const id = String(unit.id ?? unit.unit_id ?? '').trim();
    if (!id) throw new Error(`units[${index}]에 id 또는 unit_id가 없습니다.`);
    const affiliation = normalizeAffiliation(unit.force_side || unit.affiliation || unit.side);
    const unitType = normalizeType(unit.unitType ?? unit.unit_type ?? unit.icon_family);
    const echelon = normalizeEchelon(unit.echelon);
    let unitPosition = position(unit.position);
    if (!unitPosition && Array.isArray(unit.center_norm) && unit.center_norm.length >= 2) {
      const x = finite(unit.center_norm[0], .5); const y = finite(unit.center_norm[1], .5);
      unitPosition = { longitude: center[0] + (x - .5) * .04, latitude: center[1] + (.5 - y) * .03 };
    }
    if (!unitPosition) throw new Error(`${id} 유닛에 position 또는 center_norm 좌표가 없습니다.`);
    return {
      id,
      designation: String(unit.designation ?? unit.label ?? id),
      affiliation,
      unitType,
      echelon,
      sidc: String(unit.sidc ?? '') || createSidc(affiliation, unitType, echelon),
      symbolStandard: unit.symbolStandard === 'APP6' ? 'APP6' : '2525',
      symbolLabel: String(unit.symbolLabel ?? unit.label ?? unitType),
      symbolScale: finite(unit.symbolScale, .72),
      symbolRotation: finite(unit.symbolRotation ?? unit.heading, 0),
      position: unitPosition,
      initialState: unit.initialState && typeof unit.initialState === 'object' && !Array.isArray(unit.initialState)
        ? unit.initialState as DeploymentUnit['initialState']
        : undefined,
    };
  });

  const rawFeatures = Array.isArray(root.features) ? root.features : [];
  const explicitObjectives = Array.isArray(root.objectives) ? root.objectives : [];
  const objectives = explicitObjectives.map((raw, index) => {
    const item = object(raw, `objectives[${index}]`); const at = position(item.position);
    if (!at) throw new Error(`objectives[${index}]에 position이 없습니다.`);
    return { id: String(item.id ?? item.feature_id ?? `objective-${index + 1}`), name: String(item.name ?? item.label ?? `Objective ${index + 1}`), position: at };
  });
  for (const raw of rawFeatures) {
    const feature = object(raw, 'feature');
    const categories = Array.isArray(feature.categories) ? feature.categories.map(String) : [];
    if (!categories.includes('objective')) continue;
    const at = position(feature.position);
    if (at) objectives.push({ id: String(feature.feature_id), name: String(feature.label ?? feature.feature_id), position: at });
  }

  const tacticalGraphics = Array.isArray(root.tacticalGraphics) ? [...root.tacticalGraphics] as DeploymentSetup['tacticalGraphics'] : [];
  for (const raw of rawFeatures) {
    const feature = object(raw, 'feature');
    if (!feature.geometry || typeof feature.geometry !== 'object') continue;
    const categories = Array.isArray(feature.categories) ? feature.categories.map(String) : [];
    const type = categories.includes('phase-line') ? 'phase-line' : categories.includes('route') ? 'route' : categories.includes('objective') ? undefined : 'area';
    if (type) tacticalGraphics.push({ id: String(feature.feature_id), name: String(feature.label ?? feature.feature_id), type, geometry: feature.geometry as DeploymentSetup['tacticalGraphics'][number]['geometry'] });
  }

  return {
    id: String(root.id ?? `final-deployment-${Date.now()}`), name: String(root.name ?? 'AI Planning Final Deployment'),
    mettTcDocumentId: String(root.scenario_id ?? 'simulation-final'), units, objectives, tacticalGraphics,
    mapView: { center, zoom: finite(mapView?.zoom, 13.5) }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function referencePositions(deployment: DeploymentSetup) {
  const refs = new Map<string, SimulationResultPosition>();
  for (const unit of deployment.units) {
    const at = position(unit.position); if (at) { refs.set(unit.id, at); refs.set(unit.designation, at); }
  }
  for (const objective of deployment.objectives) {
    const at = position(objective.position); if (at) { refs.set(objective.id, at); refs.set(objective.name, at); }
  }
  for (const graphic of deployment.tacticalGraphics) {
    const coordinates = graphic.geometry.type === 'LineString' ? graphic.geometry.coordinates : graphic.geometry.coordinates[0];
    if (!coordinates.length) continue;
    const at = coordinates.reduce((sum, point) => ({ longitude: sum.longitude + point[0] / coordinates.length, latitude: sum.latitude + point[1] / coordinates.length }), { longitude: 0, latitude: 0 });
    refs.set(graphic.id, at); if (graphic.name) refs.set(graphic.name, at);
  }
  return refs;
}

function actionName(step: ImportedStep) {
  if (step.action) return step.action;
  const key = String(step.action_key ?? step.pddl_action ?? '').replace(/^aa-/, '').replace(/-/g, '_').toLowerCase();
  return actionNames[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function distanceMeters(a: SimulationResultPosition, b: SimulationResultPosition) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude); const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(a: SimulationResultPosition, b: SimulationResultPosition) {
  const radians = (degrees: number) => degrees * Math.PI / 180; const degrees = (value: number) => value * 180 / Math.PI;
  const dLon = radians(b.longitude - a.longitude); const lat1 = radians(a.latitude); const lat2 = radians(b.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2); const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

type RoadRoute = {
  coordinates: SimulationResultPosition[];
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
};

const MAX_ROAD_SNAP_METERS = 500;

function routingServiceUrl() {
  const env = (import.meta as unknown as { env?: { VITE_ROUTING_URL?: string } }).env;
  return (env?.VITE_ROUTING_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '');
}

function routingProfile(parameters: Record<string, unknown>) {
  const requested = String(parameters.routing_profile ?? parameters.routingProfile ?? 'driving').toLowerCase();
  return ['driving', 'cycling', 'walking'].includes(requested) ? requested : 'driving';
}

function routingWaypointRefs(parameters: Record<string, unknown>) {
  const values = parameters.via ?? parameters.waypoints;
  return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
}

function samePosition(first: SimulationResultPosition, second: SimulationResultPosition) {
  return first.longitude === second.longitude && first.latitude === second.latitude;
}

function distributeRouteKeyframes(
  coordinates: SimulationResultPosition[],
  start: number,
  end: number,
): SimulationTrackSegment['keyframes'] {
  const routeCoordinates = coordinates.length <= MAX_ROUTE_KEYFRAMES ? coordinates : Array.from(
    { length: MAX_ROUTE_KEYFRAMES },
    (_, index) => coordinates[Math.round(index * (coordinates.length - 1) / (MAX_ROUTE_KEYFRAMES - 1))],
  );
  const cumulativeDistances = routeCoordinates.reduce<number[]>((distances, coordinate, index) => {
    if (index === 0) return [0];
    return [...distances, distances[index - 1] + distanceMeters(routeCoordinates[index - 1], coordinate)];
  }, []);
  const totalDistance = cumulativeDistances.at(-1) ?? 0;
  const duration = Math.max(0, end - start);

  return routeCoordinates.map((coordinate, index) => ({
    time: totalDistance > 0 ? start + duration * (cumulativeDistances[index] / totalDistance) : start + duration * (index / Math.max(1, routeCoordinates.length - 1)),
    position: coordinate,
  }));
}

async function requestRoadRoute(
  origin: SimulationResultPosition,
  destination: SimulationResultPosition,
  waypoints: SimulationResultPosition[],
  profile: string,
): Promise<RoadRoute> {
  const coordinates = [origin, ...waypoints, destination];
  const coordinatePath = coordinates.map(point => `${point.longitude},${point.latitude}`).join(';');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${routingServiceUrl()}/route/v1/${profile}/${coordinatePath}?overview=full&geometries=geojson&steps=false`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: unknown } }>;
    };
    const route = payload.code === 'Ok' ? payload.routes?.[0] : undefined;
    const rawCoordinates = route?.geometry?.coordinates;
    if (!route || !Array.isArray(rawCoordinates) || rawCoordinates.length < 2) throw new Error(payload.code ?? 'NoRoute');
    const roadCoordinates = rawCoordinates.flatMap((value) => {
      if (!Array.isArray(value) || value.length < 2) return [];
      const longitude = finite(value[0], Number.NaN); const latitude = finite(value[1], Number.NaN);
      return Number.isFinite(longitude) && Number.isFinite(latitude) ? [{ longitude, latitude }] : [];
    });
    if (roadCoordinates.length < 2) throw new Error('Invalid route geometry');

    const originSnapDistance = distanceMeters(origin, roadCoordinates[0]);
    const destinationSnapDistance = distanceMeters(destination, roadCoordinates.at(-1)!);
    if (originSnapDistance > MAX_ROAD_SNAP_METERS || destinationSnapDistance > MAX_ROAD_SNAP_METERS) {
      throw new Error(`Road snap too far (${Math.round(originSnapDistance)}m/${Math.round(destinationSnapDistance)}m)`);
    }

    // Preserve exact scenario start/end points even when the router snaps them
    // a short distance onto the nearest road segment.
    if (!samePosition(origin, roadCoordinates[0])) roadCoordinates.unshift(origin);
    if (!samePosition(destination, roadCoordinates.at(-1)!)) roadCoordinates.push(destination);
    return {
      coordinates: roadCoordinates,
      distanceMeters: finite(route.distance, 0),
      durationSeconds: finite(route.duration, 0),
      provider: routingServiceUrl(),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function buildFinalSimulation(inputs: FinalSimulationInputs): Promise<FinalSimulationBuild> {
  const deployment = normalizeDeployment(inputs.deployment);
  const runTimestamp = Date.now();
  const simulationId = `final-${runTimestamp}`;
  // The same source deployment may be uploaded repeatedly while iterating on plans.
  // Give each run its own ID so an older browser-saved deployment can never win.
  deployment.id = `final-deployment-${runTimestamp}`;
  const blue = parseForcePlan(inputs.blueForce, 'BLUE');
  const red = parseForcePlan(inputs.redForce, 'RED');
  const grouped = {
    blueForce: blue.steps,
    redForce: red.steps,
    withdrawal: inputs.withdrawal ? planSteps(inputs.withdrawal, '후퇴 계획') : [],
  };
  const steps = Object.entries(grouped).flatMap(([planType, items]) => items.map(item => ({ ...item, planType })))
    .sort((a, b) => finite(a.start, 0) - finite(b.start, 0) || finite(a.sequence, 0) - finite(b.sequence, 0));
  if (steps.length === 0) throw new Error('실행할 계획 행동이 없습니다.');

  const refs = referencePositions(deployment);
  // Validate the complete package before making road requests or generating effects.
  const issues: PlanIssue[] = [
    ...blue.issues,
    ...red.issues,
  ];
  const checked = new Set<string>();
  const issue = (key: string, value: PlanIssue) => {
    if (!checked.has(key)) { checked.add(key); issues.push(value); }
  };
  const boundUnits = new Map<ImportedStep, DeploymentUnit>();
  for (const step of steps) {
    const actor = String(step.actor_unit_id ?? step.unit_id ?? step.actor ?? '').trim();
    const metadata = step.planning;
    // Legacy plans keep exact ID/designation lookup; Planning actors are side-scoped.
    const matches = deployment.units.filter(unit => (unit.id === actor || unit.designation === actor)
      && (!metadata || unit.affiliation === (metadata.forceSide === 'BLUE' ? 'friendly' : 'enemy')));
    const label = metadata ? `${metadata.forceSide}/${metadata.actionId}` : `${step.planType}/${step.sequence}`;
    if (matches.length !== 1) {
      issue(`actor:${metadata?.actorKey ?? actor}`, { code: 'UNRESOLVED_ACTOR', actionId: metadata?.actionId,
        message: `${label}: 부대 '${actor || '(없음)'}'의 배치 연결이 ${matches.length}개입니다. 진영과 ID 또는 배치 이름이 일치해야 합니다.` });
    } else boundUnits.set(step, matches[0]);
    if (metadata?.conditional) issue(`condition:${metadata.forceSide}:${metadata.sourceTaskId ?? metadata.actionId}`, {
      code: 'UNSUPPORTED_CONDITION', actionId: metadata.actionId,
      message: `${label}: 조건부 임무 '${metadata.sourceTaskId ?? ''}'의 실행 조건 평가가 필요합니다 (${metadata.condition ?? '조건 미기재'}).`,
    });
    const parameters = step.parameters && typeof step.parameters === 'object' && !Array.isArray(step.parameters) ? step.parameters as Record<string, unknown> : {};
    const name = actionName(step);
    const requiredReference = name === 'Move' || name === 'Withdraw' ? parameters.destination ?? parameters.target
      : name === 'Observe' || name === 'Destroy' ? parameters.target : undefined;
    if (['Move', 'Withdraw', 'Observe', 'Destroy'].includes(name) && (typeof requiredReference !== 'string' || !refs.has(requiredReference))) {
      issue(`reference:${label}`, { code: 'UNRESOLVED_REFERENCE', actionId: metadata?.actionId,
        message: `${label}: ${name}의 목적지/관측 위치 '${String(requiredReference ?? '(미해석)')}'를 배치 좌표에 연결해야 합니다.` });
    }
  }
  if (issues.length) throw new ForcePlanError(issues);
  const current = new Map(deployment.units.map(unit => [unit.id, position(unit.position)!]));
  const segments = new Map<string, SimulationTrackSegment[]>();
  const actionEffects: AtomicActionEffect[] = [];
  const observationEffects: ObservationEffect[] = [];
  const events: SimulationResultEvent[] = [];
  let sequence = 0;

  for (const step of steps) {
    sequence += 1;
    const unit = boundUnits.get(step)!;
    const start = finite(step.start, 0); const duration = step.planning ? step.duration! : Math.max(.1, finite(step.duration, finite(step.end, start + 1) - start)); const end = finite(step.end, start + duration);
    const parameters = { ...(step.parameters && typeof step.parameters === 'object' && !Array.isArray(step.parameters) ? step.parameters as Record<string, unknown> : {}),
      ...(step.planning ? { planning: step.planning, forceSide: step.planning.forceSide } : {}),
    } as Record<string, unknown>;
    const name = actionName(step); const origin = current.get(unit.id)!;
    let movement: SimulationTrackSegment | undefined;
    if (name === 'Move' || name === 'Withdraw') {
      const destinationRef = String(parameters.destination ?? parameters.target ?? '').trim();
      const destination = refs.get(destinationRef);
      if (!destination) throw new Error(`${name} 행동의 목적지 '${destinationRef || '(없음)'}' 좌표를 찾을 수 없습니다.`);
      const waypointRefs = routingWaypointRefs(parameters);
      const waypoints = waypointRefs.map((reference) => {
        const at = refs.get(reference);
        if (!at) throw new Error(`${name} 행동의 경유지 '${reference}' 좌표를 찾을 수 없습니다.`);
        return at;
      });
      let keyframes = [{ time: start, position: origin }, { time: end, position: destination }];
      let routing: SimulationTrackSegment['routing'] | undefined;
      if (String(parameters.routing_mode ?? '').toLowerCase() === 'straight') {
        routing = {
          generatedBy: 'Straight-line scenario route', provider: 'scenario', moveDuration: end - start, timingMode: 'linear',
        };
      } else try {
        const route = await requestRoadRoute(origin, destination, waypoints, routingProfile(parameters));
        keyframes = distributeRouteKeyframes(route.coordinates, start, end);
        routing = {
          generatedBy: 'Road routing', provider: route.provider, moveDuration: end - start, timingMode: 'distance-weighted',
          roadDistanceMeters: route.distanceMeters, roadDurationSeconds: route.durationSeconds,
        };
      } catch (error) {
        routing = {
          generatedBy: 'Straight-line fallback', provider: routingServiceUrl(), moveDuration: end - start, timingMode: 'linear',
          fallbackReason: error instanceof Error ? error.message : 'Road route unavailable',
        };
      }
      movement = { actionSequence: sequence, action: name, startTime: start, endTime: end, source: String(parameters.source ?? 'current_position'), destination: destinationRef, keyframes, routing };
      segments.set(unit.id, [...(segments.get(unit.id) ?? []), movement]); current.set(unit.id, destination);
    }
    let observation: ObservationEffect | undefined;
    if (name === 'Observe') {
      const targetRef = String(parameters.target ?? '').trim(); const targetPoint = refs.get(targetRef);
      if (!targetPoint) throw new Error(`Observe 행동의 표적 '${targetRef || '(없음)'}' 좌표를 찾을 수 없습니다.`);
      const targetDistanceMeters = distanceMeters(origin, targetPoint);
      const rangeMeters = Math.max(100, finite(parameters.sensor_range_m ?? parameters.range_m, 1800));
      observation = {
        actionSequence: sequence, action: 'Observe', actor: unit.designation, target: targetRef, startTime: start, endTime: end,
        origin, targetPoint, direction: finite(parameters.observation_bearing_deg ?? parameters.direction, bearingDegrees(origin, targetPoint)),
        fovDegrees: Math.max(10, Math.min(160, finite(parameters.field_of_view_deg ?? parameters.fov_degrees, 70))),
        rangeMeters, targetDistanceMeters, targetInRange: targetDistanceMeters <= rangeMeters,
        // Draw the sensor's actual coverage. A target outside that coverage must
        // remain beyond the sector instead of stretching the sector to reach it.
        displayRangeMeters: rangeMeters,
      };
      observationEffects.push(observation);
    }
    const visualizationId = visualizationIds[name] ?? String(step.action_key ?? name).toLowerCase().replace(/[\s/-]+/g, '_');
    actionEffects.push({ actionSequence: sequence, action: name, visualizationId, unitId: unit.id, actor: unit.designation, startTime: start, endTime: end, origin, parameters: { ...parameters, planType: step.planType }, phases: [visualizationId], executionMode: 'visualization_only', outcome: 'not_adjudicated', renderData: movement ? { movement } : observation ? { observation } : undefined });
    events.push({ time: start, type: 'ACTION_STARTED', actionSequence: sequence, actor: unit.designation, action: name }, { time: end, type: 'ACTION_COMPLETED', actionSequence: sequence, actor: unit.designation, action: name });
  }

  const startTime = Math.min(...actionEffects.map(effect => effect.startTime), 0);
  const endTime = Math.max(...actionEffects.map(effect => effect.endTime));
  const eliminatedAt = new Map<string, number>();
  for (const effect of actionEffects) {
    if (effect.action !== 'Destroy') continue;
    const target = String(effect.parameters.target ?? '');
    const targetUnit = deployment.units.find(unit => unit.id === target || unit.designation === target);
    if (targetUnit) eliminatedAt.set(targetUnit.id, Math.min(eliminatedAt.get(targetUnit.id) ?? Number.POSITIVE_INFINITY, effect.endTime));
  }
  const unitTracks: SimulationUnitTrack[] = deployment.units.map(unit => {
    const unitSegments = segments.get(unit.id) ?? [];
    const at = position(unit.position)!;
    return { unitId: unit.id, actor: unit.designation, startTime, endTime, eliminatedAt: eliminatedAt.get(unit.id), segments: unitSegments.length ? unitSegments : [{ actionSequence: 0, action: 'Hold', startTime, endTime, source: unit.id, destination: unit.id, keyframes: [{ time: startTime, position: at }, { time: endTime, position: at }] }] };
  });
  return { simulationId, deployment, result: { schemaVersion: '1.0', planIndex: 0, deploymentId: deployment.id, startTime, endTime, unitTracks, observationEffects, actionEffects, events: events.sort((a, b) => a.time - b.time) },
    planCounts: { blueForce: grouped.blueForce.length, redForce: grouped.redForce.length, withdrawal: grouped.withdrawal.length } };
}

function loadRuns(): Record<string, StoredFinalRun> {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, StoredFinalRun>; } catch { return {}; }
}

export function saveFinalSimulation(build: FinalSimulationBuild) {
  const latestRun = { [build.simulationId]: { result: build.result, deployment: build.deployment, planCounts: build.planCounts } };
  const serialized = JSON.stringify(latestRun);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Older accumulated runs may already consume the quota. Remove only this
    // simulator-owned cache and retry while preserving all other local data.
    window.localStorage.removeItem(STORAGE_KEY);
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      throw new Error('시뮬레이션 결과가 브라우저 저장 용량을 초과했습니다. 이동 경로 또는 입력 계획의 크기를 줄여주세요.');
    }
  }
}

export function getFinalSimulation(simulationId?: string) { return simulationId ? loadRuns()[simulationId] : undefined; }

export function getFinalSimulationDeployment(deploymentId?: string) {
  if (!deploymentId) return undefined;
  return Object.values(loadRuns()).find(run => run.deployment.id === deploymentId)?.deployment;
}
