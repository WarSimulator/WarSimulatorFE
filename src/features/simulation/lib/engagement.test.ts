import type { DeploymentSetup, SimulationResult, SimulationUnitTrack } from '../../../types';
import { toEngagementMapFeatures } from './engagement';
import { toObservationSectorFeatures } from './observation';
import { getUnitPositionAtTime } from './playback';
import { toTacticalGraphicFeatureCollection } from './tacticalGraphics';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function createTrack(unitId: string, actor: string, start: [number, number], end: [number, number]): SimulationUnitTrack {
  return {
    unitId,
    actor,
    startTime: 0,
    endTime: 60,
    segments: [
      {
        actionSequence: 0,
        action: 'Move',
        startTime: 0,
        endTime: 60,
        source: 'current_position',
        destination: 'destination',
        keyframes: [
          { time: 0, position: { longitude: start[0], latitude: start[1] } },
          { time: 60, position: { longitude: end[0], latitude: end[1] } },
        ],
      },
    ],
  };
}

const deployment: DeploymentSetup = {
  id: 'deployment-test',
  name: 'Engagement test deployment',
  mettTcDocumentId: 'mett-test',
  units: [
    {
      id: 'unit-static',
      designation: 'static_coy',
      affiliation: 'friendly',
      unitType: 'infantry',
      echelon: 'company',
      sidc: 'SFGPUCI----K',
      position: { longitude: 4, latitude: 5 },
    },
  ],
  objectives: [],
  tacticalGraphics: [
    {
      id: 'graphic-ld-line-gold',
      type: 'phase-line',
      name: 'ld_line_gold',
      geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] },
    },
  ],
};

// Test-only renderer input. The Simulator always loads the Engine fixture through simulationResultService.
const result: SimulationResult = {
  schemaVersion: '1.0',
  planIndex: 0,
  deploymentId: deployment.id,
  startTime: 0,
  endTime: 70,
  unitTracks: [
    createTrack('unit-alpha', 'alpha_coy', [0, 0], [60, 0]),
    createTrack('unit-bravo', 'bravo_coy', [0, 10], [60, 10]),
    createTrack('unit-charlie', 'charlie_coy', [0, 20], [60, 20]),
    createTrack('unit-enemy', 'Enemy_1', [100, 100], [160, 100]),
  ],
  engagementEffects: [
    { actionSequence: 7, action: 'Engage', actor: 'alpha_coy', target: 'Enemy_1', startTime: 40, endTime: 70 },
    { actionSequence: 8, action: 'Engage', actor: 'bravo_coy', target: 'Enemy_1', startTime: 45, endTime: 70 },
    { actionSequence: 9, action: 'Engage', actor: 'charlie_coy', target: 'Enemy_1', startTime: 50, endTime: 70 },
  ],
  observationEffects: [
    {
      actionSequence: 4,
      action: 'Observe',
      actor: 'alpha_coy',
      target: 'Enemy_1',
      startTime: 30,
      endTime: 40,
      origin: { longitude: 999, latitude: 999 },
      targetPoint: { longitude: 100, latitude: 100 },
      direction: 45,
      fovDegrees: 70,
      rangeMeters: 1500,
      targetDistanceMeters: 1500,
      targetInRange: false,
      displayRangeMeters: 1500,
    },
    {
      actionSequence: 5,
      action: 'Observe',
      actor: 'bravo_coy',
      target: 'Enemy_1',
      startTime: 35,
      endTime: 45,
      origin: { longitude: 998, latitude: 998 },
      targetPoint: { longitude: 100, latitude: 100 },
      direction: 25,
      fovDegrees: 70,
      rangeMeters: 1500,
      targetDistanceMeters: 1500,
      targetInRange: false,
      displayRangeMeters: 1500,
    },
    {
      actionSequence: 6,
      action: 'Observe',
      actor: 'charlie_coy',
      target: 'Enemy_1',
      startTime: 40,
      endTime: 50,
      origin: { longitude: 997, latitude: 997 },
      targetPoint: { longitude: 100, latitude: 100 },
      direction: 321,
      fovDegrees: 70,
      rangeMeters: 1500,
      targetDistanceMeters: 1500,
      targetInRange: false,
      displayRangeMeters: 1500,
    },
  ],
  events: [],
};

function assertEngagementCount(time: number, expectedLines: number, expectedLocks: number) {
  const features = toEngagementMapFeatures(result, time, deployment);
  assertEqual(features.lines.features.length, expectedLines, `t=${time} engagement line count`);
  assertEqual(features.targetLocks.features.length, expectedLocks, `t=${time} target lock count`);
}

function runEngagementTests() {
  assertEngagementCount(39, 0, 0);
  assertEngagementCount(40, 1, 1);
  assertEngagementCount(47, 2, 1);
  assertEngagementCount(55, 3, 1);
  assertEngagementCount(65, 3, 1);
  assertEngagementCount(70, 0, 0);

  const activeAt40 = toEngagementMapFeatures(result, 40, deployment).lines.features[0];
  assertEqual(activeAt40.geometry.coordinates[0][0], 40, 'actor position interpolates while moving');
  assertEqual(activeAt40.geometry.coordinates[1][0], 140, 'target position interpolates while moving');

  const activeAt65 = toEngagementMapFeatures(result, 65, deployment).lines.features[0];
  assertEqual(activeAt65.geometry.coordinates[0][0], 60, 'actor position remains at the final keyframe after moving');
  assertEqual(activeAt65.geometry.coordinates[1][0], 160, 'target position remains at the final keyframe after moving');

  const stationaryPosition = getUnitPositionAtTime('static_coy', 30, result, deployment);
  assertEqual(stationaryPosition?.longitude, 4, 'unit without a track uses deployment longitude');
  assertEqual(stationaryPosition?.latitude, 5, 'unit without a track uses deployment latitude');

  const scannerAt32 = toObservationSectorFeatures(result, 32, deployment);
  assertEqual(scannerAt32.features.length, 3, 'active observation renders all scanner bands');
  assertEqual(
    scannerAt32.features.some((feature) => feature.geometry.coordinates[0].some(([longitude, latitude]) => longitude === 32 && latitude === 0)),
    true,
    'observation scanner uses the actor position at the current simulation time',
  );
  assertEqual(toObservationSectorFeatures(result, 40, deployment).features.length, 6, 'ended observation scanner is removed while later observations remain');

  const scannersAt37 = toObservationSectorFeatures(result, 37, deployment);
  assertEqual(scannersAt37.features.length, 6, 'multiple active observations render independently');
  assertEqual(
    scannersAt37.features.some((feature) => feature.geometry.coordinates[0].some(([longitude, latitude]) => longitude === 37 && latitude === 10)),
    true,
    'second observation scanner uses its own actor position',
  );
  const scannersAt42 = toObservationSectorFeatures(result, 42, deployment);
  assertEqual(scannersAt42.features.length, 6, 'seek time renders only the observations active at that time');
  assertEqual(
    scannersAt42.features.some((feature) => feature.geometry.coordinates[0].some(([longitude, latitude]) => longitude === 42 && latitude === 20)),
    true,
    'third observation scanner appears at its actor position after seeking',
  );
  assertEqual(toObservationSectorFeatures(result, 50, deployment).features.length, 0, 'observation scanners are removed at their end times');

  const graphics = toTacticalGraphicFeatureCollection(deployment);
  assertEqual(graphics.features.length, 1, 'deployment tactical graphic is included in the shared feature collection');
  assertEqual(graphics.features[0].properties?.name, 'ld_line_gold', 'tactical graphic name is retained for labels');
}

runEngagementTests();
