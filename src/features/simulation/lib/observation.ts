import type { DeploymentSetup, ObservationEffect, SimulationResult } from '../../../types';
import { getUnitPositionAtTime } from './playback';

import { observationPolygon } from '@atlas/atomic-actions';
export { destinationPoint } from '@atlas/atomic-actions';

type ObservationSectorProperties = { actionSequence: number; actor: string; target: string; targetInRange: boolean; opacity: number };

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
      const origin = getUnitPositionAtTime(effect.actor, simulationTime, result, deployment) ?? effect.origin;
      const liveEffect = {
        ...effect,
        origin,
        direction: effect.direction + Math.sin(elapsed * Math.PI / 2) * effect.fovDegrees * 0.1,
      };
      // MapLibre fill layers do not support radial gradients. Overlapping cones
      // approximate a flashlight beam: the far end is faint and the origin is dense.
      return [
        [1, 0.04],
        [0.76, 0.06],
        [0.53, 0.1],
        [0.31, 0.16],
      ].map(([rangeScale, opacity], index) => buildObservationSector(
        { ...liveEffect, displayRangeMeters: liveEffect.displayRangeMeters * rangeScale },
        opacity,
        `-falloff-${index}`,
      ));
    }),
  };
}
