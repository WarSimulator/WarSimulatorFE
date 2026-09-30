import type { DeploymentSetup, ObservationEffect, SimulationResult } from '../../../types';
import { getUnitPositionAtTime } from './playback';

import { observationPolygon } from '@atlas/atomic-actions';
export { destinationPoint } from '@atlas/atomic-actions';

type ObservationSectorProperties = { actionSequence: number; actor: string; target: string; targetInRange: boolean; opacity: number };

// Temporary simulator policy: planner sensor ranges are not yet authoritative.
// Keep Observe coverage readable and consistent across imported plan versions.
export const FIXED_OBSERVATION_RANGE_METERS = 4_000;

export function buildObservationSector(effect: ObservationEffect, opacity = 0.1, idSuffix = ''): GeoJSON.Feature<GeoJSON.Polygon, ObservationSectorProperties> {
  return {
    type: 'Feature',
    id: `observation-${effect.actionSequence}${idSuffix}`,
    properties: {
      actionSequence: effect.actionSequence,
      actor: effect.actor,
      target: effect.target,
      targetInRange: effect.targetInRange,
      opacity,
    },
    geometry: observationPolygon(effect),
  };
}

export function getActiveObservationEffects(result: SimulationResult, simulationTime: number) {
  return (result.observationEffects ?? []).filter((effect) => effect.startTime <= simulationTime && simulationTime < effect.endTime);
}

export function toObservationSectorFeatures(
  result: SimulationResult,
  simulationTime: number,
  deployment?: DeploymentSetup,
): GeoJSON.FeatureCollection<GeoJSON.Polygon, ObservationSectorProperties> {
  return {
    type: 'FeatureCollection',
    features: getActiveObservationEffects(result, simulationTime).flatMap(effect => {
      const elapsed = simulationTime - effect.startTime;
      const unitId = result.actionEffects?.find(action => action.actionSequence === effect.actionSequence)?.unitId;
      const origin = getUnitPositionAtTime(unitId ?? effect.actor, simulationTime, result, deployment) ?? effect.origin;
      const liveEffect = {
        ...effect,
        origin,
        rangeMeters: FIXED_OBSERVATION_RANGE_METERS,
        displayRangeMeters: FIXED_OBSERVATION_RANGE_METERS,
        targetInRange: effect.targetDistanceMeters <= FIXED_OBSERVATION_RANGE_METERS,
        direction: effect.direction + Math.sin(elapsed * Math.PI / 2) * effect.fovDegrees * 0.1,
      };
      return [buildObservationSector(liveEffect, 0.3)];
    }),
  };
}
