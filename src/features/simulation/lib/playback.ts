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

const keyframeCache = new WeakMap<SimulationUnitTrack, SimulationKeyframe[]>();

/** Track keyframes are immutable after a result is built. Sort them once, not per animation frame. */
function sortedKeyframes(track: SimulationUnitTrack): SimulationKeyframe[] {
  const cached = keyframeCache.get(track);
  if (cached) return cached;
  const keyframes = track.segments.flatMap((segment) => segment.keyframes).sort((first, second) => first.time - second.time);
  keyframeCache.set(track, keyframes);
  return keyframes;
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

  let low = 0;
  let high = keyframes.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (keyframes[middle].time <= simulationTime) low = middle + 1;
    else high = middle - 1;
  }

  const previous = keyframes[Math.max(0, high)];
  const next = keyframes[Math.min(keyframes.length - 1, high + 1)];
  if (previous && next) {
    const duration = next.time - previous.time;
    const progress = duration === 0 ? 1 : (simulationTime - previous.time) / duration;
    return interpolatePosition(previous.position, next.position, progress);
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
