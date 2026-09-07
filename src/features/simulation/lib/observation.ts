import type { ObservationEffect, SimulationResult } from '../../../types';

import { observationPolygon } from '@atlas/atomic-actions';
export { destinationPoint } from '@atlas/atomic-actions';

type ObservationSectorProperties = { actionSequence: number; actor: string; target: string; targetInRange: boolean };

export function buildObservationSector(effect: ObservationEffect): GeoJSON.Feature<GeoJSON.Polygon, ObservationSectorProperties> {
  return {
    type: 'Feature',
    id: `observation-${effect.actionSequence}`,
    properties: {
      actionSequence: effect.actionSequence,
      actor: effect.actor,
      target: effect.target,
      targetInRange: effect.targetInRange,
    },
    geometry: observationPolygon(effect),
  };
}

export function getActiveObservationEffects(result: SimulationResult, simulationTime: number) {
  return (result.observationEffects ?? []).filter((effect) => effect.startTime <= simulationTime && simulationTime < effect.endTime);
}

export function toObservationSectorFeatures(result: SimulationResult, simulationTime: number): GeoJSON.FeatureCollection<GeoJSON.Polygon, ObservationSectorProperties> {
  return {
    type: 'FeatureCollection',
    features: getActiveObservationEffects(result, simulationTime).flatMap(effect => {
      const elapsed = simulationTime - effect.startTime;
      const sweep = buildObservationSector({ ...effect,
        direction: effect.direction + Math.sin(elapsed * Math.PI / 2) * effect.fovDegrees * 0.43,
        fovDegrees: Math.min(6, effect.fovDegrees),
      });
      sweep.id = `observation-sweep-${effect.actor}-${effect.actionSequence}`;
      return [buildObservationSector(effect), sweep];
    }),
  };
}
