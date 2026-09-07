import type {
  DeploymentSetup,
  SimulationKeyframe,
  SimulationResult,
  SimulationResultEvent,
  SimulationResultPosition,
  SimulationUnitTrack,
} from '../../../types';

export function interpolatePosition(
  start: SimulationResultPosition,
  end: SimulationResultPosition,
  progress: number,
): SimulationResultPosition {
  return {
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
  };
}

function sortedKeyframes(track: SimulationUnitTrack): SimulationKeyframe[] {
  return track.segments.flatMap((segment) => segment.keyframes).sort((first, second) => first.time - second.time);
}

export function getPositionAtTime(track: SimulationUnitTrack, simulationTime: number): SimulationResultPosition | undefined {
  const keyframes = sortedKeyframes(track);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];

  if (!first || !last) {
    return undefined;
  }

  if (simulationTime <= first.time) {
    return first.position;
  }

  if (simulationTime >= last.time) {
    return last.position;
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const previous = keyframes[index];
    const next = keyframes[index + 1];

    if (simulationTime >= previous.time && simulationTime <= next.time) {
      const duration = next.time - previous.time;
      const progress = duration === 0 ? 1 : (simulationTime - previous.time) / duration;
      return interpolatePosition(previous.position, next.position, progress);
    }
  }

  return last.position;
}

export function getTrackPositionsAtTime(result: SimulationResult, simulationTime: number) {
  const positions = result.unitTracks.map((track) => ({
    unitId: track.unitId,
    actor: track.actor,
    position: getPositionAtTime(track, simulationTime),
  }));
  for (const effect of result.actionEffects ?? []) {
    if (!positions.some(position => position.unitId === effect.unitId)) {
      positions.push({ unitId: effect.unitId, actor: effect.actor, position: effect.origin });
    }
  }
  return positions;
}

/** Finds an animated track by scenario ID or actor label, then falls back to deployment coordinates. */
export function getUnitPositionAtTime(
  actorOrUnitId: string,
  simulationTime: number,
  result: SimulationResult,
  deployment?: DeploymentSetup,
): SimulationResultPosition | undefined {
  const track = result.unitTracks.find((candidate) => candidate.unitId === actorOrUnitId || candidate.actor === actorOrUnitId);
  const animatedPosition = track ? getPositionAtTime(track, simulationTime) : undefined;
  if (animatedPosition) return animatedPosition;

  const unit = deployment?.units.find((candidate) => candidate.id === actorOrUnitId || candidate.designation === actorOrUnitId);
  const longitude = unit?.position.longitude ?? unit?.position.lon;
  const latitude = unit?.position.latitude ?? unit?.position.lat;
  return typeof longitude === 'number' && typeof latitude === 'number' ? { longitude, latitude } : undefined;
}

export function getEventsAtTime(result: SimulationResult, simulationTime: number): SimulationResultEvent[] {
  return result.events.filter((event) => event.time <= simulationTime).sort((first, second) => first.time - second.time);
}

export function clampResultTime(result: SimulationResult, simulationTime: number) {
  return Math.max(result.startTime, Math.min(result.endTime, simulationTime));
}
