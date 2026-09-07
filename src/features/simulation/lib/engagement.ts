import type { DeploymentSetup, EngagementEffect, SimulationResult } from '../../../types';
import { getUnitPositionAtTime } from './playback';

type EngagementLineProperties = {
  actionSequence: number;
  actor: string;
  target: string;
};

type EngagementTargetLockProperties = {
  target: string;
};

export type EngagementMapFeatures = {
  lines: GeoJSON.FeatureCollection<GeoJSON.LineString, EngagementLineProperties>;
  targetLocks: GeoJSON.FeatureCollection<GeoJSON.Point, EngagementTargetLockProperties>;
};

export function getActiveEngagementEffects(result: SimulationResult, simulationTime: number): EngagementEffect[] {
  return (result.engagementEffects ?? []).filter((effect) => effect.startTime <= simulationTime && simulationTime < effect.endTime);
}

export function toEngagementMapFeatures(
  result: SimulationResult,
  simulationTime: number,
  deployment?: DeploymentSetup,
): EngagementMapFeatures {
  const activeEffects = getActiveEngagementEffects(result, simulationTime);
  const lines: EngagementMapFeatures['lines']['features'] = [];
  const targetLocks: EngagementMapFeatures['targetLocks']['features'] = [];
  const lockedTargets = new Set<string>();

  for (const effect of activeEffects) {
    const actorPosition = getUnitPositionAtTime(effect.actor, simulationTime, result, deployment);
    const targetPosition = getUnitPositionAtTime(effect.target, simulationTime, result, deployment);

    if (!actorPosition || !targetPosition) {
      continue;
    }

    lines.push({
      type: 'Feature',
      id: `engagement-${effect.actionSequence}`,
      properties: {
        actionSequence: effect.actionSequence,
        actor: effect.actor,
        target: effect.target,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [actorPosition.longitude, actorPosition.latitude],
          [targetPosition.longitude, targetPosition.latitude],
        ],
      },
    });

    if (!lockedTargets.has(effect.target)) {
      lockedTargets.add(effect.target);
      targetLocks.push({
        type: 'Feature',
        id: `engagement-target-lock-${effect.target}`,
        properties: { target: effect.target },
        geometry: {
          type: 'Point',
          coordinates: [targetPosition.longitude, targetPosition.latitude],
        },
      });
    }
  }

  return {
    lines: { type: 'FeatureCollection', features: lines },
    targetLocks: { type: 'FeatureCollection', features: targetLocks },
  };
}
