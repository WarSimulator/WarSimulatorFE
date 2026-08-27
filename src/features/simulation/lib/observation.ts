import type { ObservationEffect, SimulationResult } from '../../../types';

const EARTH_RADIUS_METERS = 6_371_008.8;
const ARC_SEGMENTS = 32;

type ObservationSectorProperties = {
  actionSequence: number;
  actor: string;
  target: string;
  targetInRange: boolean;
};

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

export function destinationPoint(
  longitude: number,
  latitude: number,
  bearingDegrees: number,
  distanceMeters: number,
): [number, number] {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDegrees);
  const originLatitude = toRadians(latitude);
  const originLongitude = toRadians(longitude);

  const destinationLatitude = Math.asin(
    Math.sin(originLatitude) * Math.cos(angularDistance) + Math.cos(originLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const destinationLongitude = originLongitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(originLatitude),
    Math.cos(angularDistance) - Math.sin(originLatitude) * Math.sin(destinationLatitude),
  );

  return [((toDegrees(destinationLongitude) + 540) % 360) - 180, toDegrees(destinationLatitude)];
}

export function buildObservationSector(effect: ObservationEffect): GeoJSON.Feature<GeoJSON.Polygon, ObservationSectorProperties> {
  const leftBearing = effect.direction - effect.fovDegrees / 2;
  const coordinates: [number, number][] = [[effect.origin.longitude, effect.origin.latitude]];

  for (let index = 0; index <= ARC_SEGMENTS; index += 1) {
    const bearing = leftBearing + (effect.fovDegrees * index) / ARC_SEGMENTS;
    coordinates.push(destinationPoint(effect.origin.longitude, effect.origin.latitude, bearing, effect.displayRangeMeters));
  }

  coordinates.push([effect.origin.longitude, effect.origin.latitude]);

  return {
    type: 'Feature',
    id: `observation-${effect.actionSequence}`,
    properties: {
      actionSequence: effect.actionSequence,
      actor: effect.actor,
      target: effect.target,
      targetInRange: effect.targetInRange,
    },
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  };
}

export function getActiveObservationEffects(result: SimulationResult, simulationTime: number) {
  return (result.observationEffects ?? []).filter((effect) => effect.startTime <= simulationTime && simulationTime < effect.endTime);
}

export function toObservationSectorFeatures(result: SimulationResult, simulationTime: number): GeoJSON.FeatureCollection<GeoJSON.Polygon, ObservationSectorProperties> {
  return {
    type: 'FeatureCollection',
    features: getActiveObservationEffects(result, simulationTime).map(buildObservationSector),
  };
}
