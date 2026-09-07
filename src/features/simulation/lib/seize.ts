import type { ControlChange, DeploymentSetup, SimulationResult } from '../../../types';

export const SEIZE_COMPLETE_DISPLAY_DURATION_SECONDS = 3;

export function getControllerAtTime(
  target: string,
  simulationTime: number,
  controlChanges: ControlChange[] = [],
): ControlChange | undefined {
  return controlChanges
    .filter((change) => change.target === target && change.time <= simulationTime)
    .sort((first, second) => first.time - second.time || first.actionSequence - second.actionSequence)
    .at(-1);
}

export function toSeizeTargetFeatures(
  deployment: DeploymentSetup | undefined,
  result: SimulationResult,
  simulationTime: number,
): GeoJSON.FeatureCollection {
  const activeTargets = new Set(
    (result.seizureEffects ?? [])
      .filter((effect) => effect.seizeStartTime <= simulationTime && simulationTime < effect.endTime)
      .map((effect) => effect.target),
  );

  return {
    type: 'FeatureCollection',
    features: (deployment?.tacticalGraphics ?? []).flatMap((graphic) => {
      const controlChange = getControllerAtTime(graphic.name ?? '', simulationTime, result.controlChanges ?? []);
      const isSeizing = activeTargets.has(graphic.name ?? '');
      if (!controlChange && !isSeizing) return [];

      return [{
        type: 'Feature' as const,
        id: `seize-${graphic.id}`,
        properties: {
          id: graphic.id,
          controller: controlChange?.controller ?? '',
          state: isSeizing ? 'seizing' : 'controlled',
          geometryType: graphic.geometry.type,
        },
        geometry: graphic.geometry,
      }];
    }),
  };
}

function getStatusAnchor(graphic: NonNullable<DeploymentSetup['tacticalGraphics']>[number]): [number, number] | undefined {
  if (graphic.geometry.type === 'LineString') {
    const coordinates = graphic.geometry.coordinates;
    return coordinates[Math.floor(coordinates.length / 2)];
  }

  const ring = graphic.geometry.coordinates[0] ?? [];
  const coordinates = ring.length > 1 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]
    ? ring.slice(0, -1)
    : ring;
  if (coordinates.length === 0) return undefined;

  const total = coordinates.reduce(
    (current, coordinate) => [current[0] + coordinate[0], current[1] + coordinate[1]] as [number, number],
    [0, 0] as [number, number],
  );
  return [total[0] / coordinates.length, total[1] / coordinates.length];
}

/**
 * Presentation-only status labels derived from Engine Seize timings. They do
 * not alter seizure state, controller state, or the source SimulationResult.
 */
export function toSeizeStatusFeatures(
  deployment: DeploymentSetup | undefined,
  result: SimulationResult,
  simulationTime: number,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const statusByTarget = new Map<string, { state: 'seizing' | 'complete'; actor: string }>();

  for (const effect of result.seizureEffects ?? []) {
    if (effect.endTime <= simulationTime && simulationTime < effect.endTime + SEIZE_COMPLETE_DISPLAY_DURATION_SECONDS) {
      statusByTarget.set(effect.target, { state: 'complete', actor: effect.actor });
    }
    if (effect.seizeStartTime <= simulationTime && simulationTime < effect.endTime) {
      statusByTarget.set(effect.target, { state: 'seizing', actor: effect.actor });
    }
  }

  return {
    type: 'FeatureCollection',
    features: (deployment?.tacticalGraphics ?? []).flatMap((graphic) => {
      const statusEntry = statusByTarget.get(graphic.name ?? '');
      const anchor = statusEntry ? getStatusAnchor(graphic) : undefined;
      if (!statusEntry || !anchor) return [];
      const affiliation = deployment?.units.find((unit) => unit.id === statusEntry.actor || unit.designation === statusEntry.actor)?.affiliation ?? '';

      return [{
        type: 'Feature' as const,
        id: `seize-status-${graphic.id}`,
        properties: {
          id: graphic.id,
          state: statusEntry.state,
          affiliation,
          label: statusEntry.state === 'seizing' ? 'SEIZING…' : 'SEIZE COMPLETE',
        },
        geometry: { type: 'Point' as const, coordinates: anchor },
      }];
    }),
  };
}
