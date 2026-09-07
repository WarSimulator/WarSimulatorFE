import simulationDeployment from '../../../../deployment.json';
import engineSimulationResult from '../../../fixtures/engineSimulationResult.json';
import type { DeploymentSetup, SimulationResult, SimulationUnitTrack } from '../../../types';
import { toEngagementMapFeatures } from './engagement';
import { getActiveObservationEffects } from './observation';
import { getUnitPositionAtTime } from './playback';
import { getControllerAtTime, toSeizeStatusFeatures, toSeizeTargetFeatures } from './seize';
import {
  loadSimulationDeployment,
  loadSimulationResult,
  validateSimulationResultReferences,
} from './simulationResultService';

const deployment = simulationDeployment as unknown as DeploymentSetup;
const result = engineSimulationResult as SimulationResult;

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

function track(actor: string): SimulationUnitTrack {
  const matched = result.unitTracks.find((candidate) => candidate.actor === actor);
  if (!matched) throw new Error(`Missing track for ${actor}`);
  return matched;
}

function segment(actor: string, actionSequence: number) {
  const matched = track(actor).segments.find((candidate) => candidate.actionSequence === actionSequence);
  if (!matched) throw new Error(`Missing actionSequence ${actionSequence} segment for ${actor}`);
  return matched;
}

function assertPositionAt(actor: string, time: number, expected: { longitude: number; latitude: number }) {
  const position = getUnitPositionAtTime(actor, time, result, deployment);
  assertEqual(position?.longitude, expected.longitude, `${actor} longitude at t=${time}`);
  assertEqual(position?.latitude, expected.latitude, `${actor} latitude at t=${time}`);
}

function runSimulationResultTests() {
  const loadedDeployment = loadSimulationDeployment();
  const loadedResult = loadSimulationResult();
  assertDeepEqual(loadedResult, result, 'Engine fixture must be preserved by loadSimulationResult');
  assertDeepEqual(loadedDeployment, deployment, 'Deployment fixture must be preserved by loadSimulationDeployment');
  validateSimulationResultReferences(loadedResult, loadedDeployment);

  assertEqual(loadedResult.endTime, 120, 'Engine fixture endTime');
  assertEqual(loadedResult.unitTracks.length, 4, 'Engine fixture unit-track count');
  assertEqual(loadedResult.observationEffects?.length, 3, 'Engine fixture observation count');
  assertEqual(loadedResult.engagementEffects?.length, 3, 'Engine fixture engagement count');
  assertEqual(loadedResult.seizureEffects?.length, 3, 'Engine fixture Seize count');
  assertEqual(loadedResult.controlChanges?.length, 3, 'Engine fixture control-change count');
  assertEqual(
    Math.max(
      ...loadedResult.unitTracks.flatMap((item) => item.segments.map((item) => item.actionSequence)),
      ...(loadedResult.observationEffects ?? []).map((item) => item.actionSequence),
      ...(loadedResult.engagementEffects ?? []).map((item) => item.actionSequence),
      ...(loadedResult.seizureEffects ?? []).map((item) => item.actionSequence),
      ...loadedResult.events.map((item) => item.actionSequence),
    ),
    13,
    'Engine fixture maximum actionSequence',
  );

  const alpha = track('alpha_coy');
  const charlie = track('charlie_coy');
  const enemy = track('Enemy_1');
  const alphaAutoMove = segment('alpha_coy', 11);
  const enemyAutoMove = segment('Enemy_1', 13);

  assertPositionAt('alpha_coy', 50, alpha.segments[0].keyframes.at(-1)!.position);
  assertPositionAt('alpha_coy', 80, alphaAutoMove.keyframes.at(-1)!.position);
  assertPositionAt('charlie_coy', 65, charlie.segments[1].keyframes.at(-1)!.position);
  assertPositionAt('Enemy_1', 89.9, enemy.segments[0].keyframes.at(-1)!.position);
  assertPositionAt('Enemy_1', 110, enemyAutoMove.keyframes.at(-1)!.position);

  assertEqual(getActiveObservationEffects(result, 0).length, 0, 'no observations are active at t=0');
  assertEqual(getActiveObservationEffects(result, 15).length, 1, 'Alpha observation starts at t=15');
  assertEqual(getActiveObservationEffects(result, 20).length, 2, 'Bravo observation starts at t=20');
  assertEqual(getActiveObservationEffects(result, 25).length, 3, 'Charlie observation starts at t=25');
  assertEqual(getActiveObservationEffects(result, 40).length, 0, 'observations end exclusively at t=40');

  assertEqual(toEngagementMapFeatures(result, 30, deployment).lines.features.length, 1, 'Enemy Engage starts at t=30');
  assertEqual(toEngagementMapFeatures(result, 40, deployment).lines.features.length, 3, 'three Engage effects are active at t=40');
  assertEqual(toEngagementMapFeatures(result, 60, deployment).lines.features.length, 0, 'Engage effects end exclusively at t=60');

  assertEqual(alphaAutoMove.startTime, 60, 'Alpha Seize Auto Move start time');
  assertEqual(alphaAutoMove.endTime, 80, 'Alpha Seize Auto Move end time');
  assertEqual(alphaAutoMove.destination, 'Enemy_Area', 'Alpha Seize Auto Move destination');
  assertEqual(alphaAutoMove.routing?.generatedBy, 'Seize', 'Alpha Auto Move generator');
  assertEqual(typeof alphaAutoMove.routing?.referenceMoveTime, 'number', 'Alpha reference move time exists');
  assertEqual(alphaAutoMove.routing?.moveDuration, 20, 'Alpha Auto Move duration');
  assertEqual(alphaAutoMove.routing?.timingMode, 'compressed', 'Alpha Auto Move timing mode');
  assertEqual(typeof alphaAutoMove.routing?.timeCompressionRatio, 'number', 'Alpha compression ratio exists');

  const charlieSeize = result.seizureEffects?.find((effect) => effect.actionSequence === 12);
  assertEqual(charlieSeize?.startTime, 65, 'Charlie Seize start time');
  assertEqual(charlieSeize?.seizeStartTime, 65, 'Charlie starts Seizing without Auto Move');
  assertEqual(charlieSeize?.moveDuration, 0, 'Charlie Seize Auto Move duration');
  assertEqual(charlieSeize?.endTime, 90, 'Charlie Seize end time');
  assertEqual(charlie.segments.some((candidate) => candidate.actionSequence === 12), false, 'Charlie has no Seize Auto Move segment');

  assertEqual(enemyAutoMove.startTime, 90, 'Enemy_1 Seize Auto Move start time');
  assertEqual(enemyAutoMove.endTime, 110, 'Enemy_1 Seize Auto Move end time');
  assertEqual(enemyAutoMove.destination, 'Enemy_Area', 'Enemy_1 Seize Auto Move destination');
  assertEqual(enemyAutoMove.routing?.timingMode, 'compressed', 'Enemy_1 Auto Move timing mode');

  assertEqual(getControllerAtTime('Enemy_Area', 89.9, result.controlChanges)?.controller, undefined, 'Enemy_Area has no controller before t=90');
  assertEqual(getControllerAtTime('Enemy_Area', 90, result.controlChanges)?.controller, 'friendly', 'Enemy_Area becomes friendly at t=90');
  assertEqual(getControllerAtTime('Enemy_line', 90, result.controlChanges)?.controller, 'friendly', 'Enemy_line becomes friendly at t=90');
  assertEqual(getControllerAtTime('Enemy_Area', 119.9, result.controlChanges)?.controller, 'friendly', 'Enemy_Area remains friendly while Enemy_1 is seizing');
  assertEqual(getControllerAtTime('Enemy_Area', 120, result.controlChanges)?.controller, 'enemy', 'Enemy_Area becomes enemy at t=120');

  const seizingAt80 = toSeizeTargetFeatures(deployment, result, 80);
  assertEqual(seizingAt80.features.length, 2, 'Alpha and Charlie targets are seizing at t=80');
  assertEqual(seizingAt80.features.every((feature) => feature.properties?.state === 'seizing'), true, 'Seizing targets receive highlight states');
  const seizingAt72 = toSeizeTargetFeatures(deployment, result, 72);
  assertEqual(seizingAt72.features.length, 1, 'only Charlie Seize is active at t=72');
  assertEqual(seizingAt72.features[0].properties?.id, 'graphic-31334f5f-23b0-479d-973a-b9f03cace370', 'Enemy_Area has no Seize overlay at t=72');
  assertEqual(seizingAt72.features[0].properties?.geometryType, 'LineString', 'phase-line Seize is rendered as a line without an area fill');
  const enemyAreaAt90 = toSeizeTargetFeatures(deployment, result, 90).features.find((feature) => feature.properties?.id === 'graphic-5e9bbd2e-06ce-4b5b-b6f1-c0d9f62a3ec8');
  assertEqual(enemyAreaAt90?.properties?.state, 'controlled', 'Enemy_Area becomes controlled after the friendly Seize completes');
  assertEqual(enemyAreaAt90?.properties?.controller, 'friendly', 'Enemy_Area retains the friendly controller after completion');
  const enemyAreaAt110 = toSeizeTargetFeatures(deployment, result, 110).features.find((feature) => feature.properties?.id === 'graphic-5e9bbd2e-06ce-4b5b-b6f1-c0d9f62a3ec8');
  assertEqual(enemyAreaAt110?.properties?.state, 'seizing', 'Enemy_Area enters the Seizing visual state for Enemy_1');
  assertEqual(enemyAreaAt110?.properties?.controller, 'friendly', 'Enemy_Area controller remains friendly until Enemy_1 completes');
  const enemyAreaAt120 = toSeizeTargetFeatures(deployment, result, 120).features.find((feature) => feature.properties?.id === 'graphic-5e9bbd2e-06ce-4b5b-b6f1-c0d9f62a3ec8');
  assertEqual(enemyAreaAt120?.properties?.state, 'controlled', 'Enemy_Area leaves the Seizing visual state after Enemy_1 completes');
  assertEqual(enemyAreaAt120?.properties?.controller, 'enemy', 'Enemy_Area becomes enemy-controlled after completion');

  const seizeStatusesAt80 = toSeizeStatusFeatures(deployment, result, 80);
  assertEqual(seizeStatusesAt80.features.length, 2, 'Alpha and Charlie receive Seizing labels at t=80');
  assertEqual(seizeStatusesAt80.features.every((feature) => feature.properties?.label === 'SEIZING…'), true, 'active Seize labels use Seizing text');
  assertEqual(seizeStatusesAt80.features.every((feature) => feature.properties?.affiliation === 'friendly'), true, 'friendly Seize labels retain the actor affiliation');
  const seizeStatusesAt90 = toSeizeStatusFeatures(deployment, result, 90);
  assertEqual(seizeStatusesAt90.features.length, 2, 'completed Alpha and Charlie Seizes receive completion labels');
  assertEqual(seizeStatusesAt90.features.every((feature) => feature.properties?.label === 'SEIZE COMPLETE'), true, 'completed Seizes use completion text');
  const seizeStatusesAt120 = toSeizeStatusFeatures(deployment, result, 120);
  assertEqual(seizeStatusesAt120.features[0]?.properties?.affiliation, 'enemy', 'Enemy Seize completion label retains enemy affiliation');
  assertEqual(toSeizeStatusFeatures(deployment, result, 93).features.length, 0, 'completion labels disappear after the display interval');
}

runSimulationResultTests();
