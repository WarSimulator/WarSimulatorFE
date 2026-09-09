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

const STORAGE_KEY = 'atlas-defense.simulation-final-runs';

type JsonObject = Record<string, unknown>;

type ImportedStep = {
  sequence?: number;
  start?: number;
  duration?: number;
  end?: number;
  action?: string;
  action_key?: string;
  pddl_action?: string;
  actor_unit_id?: string;
  unit_id?: string;
  actor?: string;
  parameters?: unknown;
};

type StoredFinalRun = {
  result: SimulationResult;
  deployment: DeploymentSetup;
  planCounts: { offensive: number; defensive: number; withdrawal: number };
};

export type FinalSimulationInputs = {
  offensive: unknown;
  defensive: unknown;
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
  seize: 'Seize', disrupt: 'Disrupt',
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
  return String(value).toLowerCase().includes('hostile') || String(value).toLowerCase().includes('enemy') ? 'enemy' : 'friendly';
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
    const affiliation = normalizeAffiliation(unit.affiliation ?? unit.side);
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

  const tacticalGraphics = Array.isArray(root.tacticalGraphics) ? root.tacticalGraphics as DeploymentSetup['tacticalGraphics'] : [];
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

export function buildFinalSimulation(inputs: FinalSimulationInputs): FinalSimulationBuild {
  const deployment = normalizeDeployment(inputs.deployment);
  const runTimestamp = Date.now();
  const simulationId = `final-${runTimestamp}`;
  // The same source deployment may be uploaded repeatedly while iterating on plans.
  // Give each run its own ID so an older browser-saved deployment can never win.
  deployment.id = `final-deployment-${runTimestamp}`;
  const grouped = {
    offensive: planSteps(inputs.offensive, '공격 계획'),
    defensive: planSteps(inputs.defensive, '수비 계획'),
    withdrawal: inputs.withdrawal ? planSteps(inputs.withdrawal, '후퇴 계획') : [],
  };
  const steps = Object.entries(grouped).flatMap(([planType, items]) => items.map(item => ({ ...item, planType })))
    .sort((a, b) => finite(a.start, 0) - finite(b.start, 0) || finite(a.sequence, 0) - finite(b.sequence, 0));
  if (steps.length === 0) throw new Error('실행할 계획 행동이 없습니다.');

  const unitById = new Map(deployment.units.flatMap(unit => [[unit.id, unit], [unit.designation, unit]]));
  const refs = referencePositions(deployment);
  const current = new Map(deployment.units.map(unit => [unit.id, position(unit.position)!]));
  const segments = new Map<string, SimulationTrackSegment[]>();
  const actionEffects: AtomicActionEffect[] = [];
  const observationEffects: ObservationEffect[] = [];
  const events: SimulationResultEvent[] = [];
  let sequence = 0;

  for (const step of steps) {
    sequence += 1;
    const actorRef = String(step.actor_unit_id ?? step.unit_id ?? step.actor ?? '').trim();
    const unit = unitById.get(actorRef);
    if (!unit) throw new Error(`${step.planType} 계획 ${step.sequence ?? sequence}번 행동의 actor '${actorRef || '(없음)'}'를 유닛 배치에서 찾을 수 없습니다.`);
    const start = finite(step.start, 0); const duration = Math.max(.1, finite(step.duration, finite(step.end, start + 1) - start)); const end = finite(step.end, start + duration);
    const parameters = step.parameters && typeof step.parameters === 'object' && !Array.isArray(step.parameters) ? step.parameters as Record<string, unknown> : {};
    const name = actionName(step); const origin = current.get(unit.id)!;
    let movement: SimulationTrackSegment | undefined;
    if (name === 'Move' || name === 'Withdraw') {
      const destinationRef = String(parameters.destination ?? parameters.target ?? '').trim();
      const destination = refs.get(destinationRef);
      if (!destination) throw new Error(`${name} 행동의 목적지 '${destinationRef || '(없음)'}' 좌표를 찾을 수 없습니다.`);
      movement = { actionSequence: sequence, action: name, startTime: start, endTime: end, source: String(parameters.source ?? 'current_position'), destination: destinationRef, keyframes: [{ time: start, position: origin }, { time: end, position: destination }] };
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
        displayRangeMeters: Math.max(rangeMeters, targetDistanceMeters * 1.08),
      };
      observationEffects.push(observation);
    }
    const visualizationId = visualizationIds[name] ?? String(step.action_key ?? name).toLowerCase().replace(/[\s/-]+/g, '_');
    actionEffects.push({ actionSequence: sequence, action: name, visualizationId, unitId: unit.id, actor: unit.designation, startTime: start, endTime: end, origin, parameters: { ...parameters, planType: step.planType }, phases: [visualizationId], executionMode: 'visualization_only', outcome: 'not_adjudicated', renderData: movement ? { movement } : observation ? { observation } : undefined });
    events.push({ time: start, type: 'ACTION_STARTED', actionSequence: sequence, actor: unit.designation, action: name }, { time: end, type: 'ACTION_COMPLETED', actionSequence: sequence, actor: unit.designation, action: name });
  }

  const startTime = Math.min(...actionEffects.map(effect => effect.startTime), 0);
  const endTime = Math.max(...actionEffects.map(effect => effect.endTime));
  const unitTracks: SimulationUnitTrack[] = deployment.units.map(unit => {
    const unitSegments = segments.get(unit.id) ?? [];
    const at = position(unit.position)!;
    return { unitId: unit.id, actor: unit.designation, startTime, endTime, segments: unitSegments.length ? unitSegments : [{ actionSequence: 0, action: 'Hold', startTime, endTime, source: unit.id, destination: unit.id, keyframes: [{ time: startTime, position: at }, { time: endTime, position: at }] }] };
  });
  return { simulationId, deployment, result: { schemaVersion: '1.0', planIndex: 0, deploymentId: deployment.id, startTime, endTime, unitTracks, observationEffects, actionEffects, events: events.sort((a, b) => a.time - b.time) }, planCounts: { offensive: grouped.offensive.length, defensive: grouped.defensive.length, withdrawal: grouped.withdrawal.length } };
}

function loadRuns(): Record<string, StoredFinalRun> {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, StoredFinalRun>; } catch { return {}; }
}

export function saveFinalSimulation(build: FinalSimulationBuild) {
  const runs = loadRuns(); runs[build.simulationId] = { result: build.result, deployment: build.deployment, planCounts: build.planCounts };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

export function getFinalSimulation(simulationId?: string) { return simulationId ? loadRuns()[simulationId] : undefined; }

export function getFinalSimulationDeployment(deploymentId?: string) {
  if (!deploymentId) return undefined;
  return Object.values(loadRuns()).find(run => run.deployment.id === deploymentId)?.deployment;
}
