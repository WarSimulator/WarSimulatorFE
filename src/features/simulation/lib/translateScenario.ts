import type { DeploymentSetup, SimulationResult } from '../../../types';
import { DEFAULT_MAP_ZOOM } from './mapConfig';
import { createGeoPosition, getLngLat } from './position';

function translateGeometryCoordinates(value: unknown, longitudeOffset: number, latitudeOffset: number): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [value[0] + longitudeOffset, value[1] + latitudeOffset, ...value.slice(2)];
  }
  return value.map(item => translateGeometryCoordinates(item, longitudeOffset, latitudeOffset));
}

export function translateDeployment(
  deployment: DeploymentSetup,
  center: [number, number],
): DeploymentSetup {
  const sourceCenter = deployment.mapView?.center;
  if (!sourceCenter) return deployment;
  const longitudeOffset = center[0] - sourceCenter[0];
  const latitudeOffset = center[1] - sourceCenter[1];

  return {
    ...deployment,
    name: '설악산 Alpha Deployment',
    units: deployment.units.map(unit => ({
      ...unit,
      position: createGeoPosition(
        getLngLat(unit.position)[0] + longitudeOffset,
        getLngLat(unit.position)[1] + latitudeOffset,
      ),
    })),
    objectives: deployment.objectives.map(objective => ({
      ...objective,
      position: createGeoPosition(
        getLngLat(objective.position)[0] + longitudeOffset,
        getLngLat(objective.position)[1] + latitudeOffset,
      ),
    })),
    tacticalGraphics: deployment.tacticalGraphics.map(graphic => ({
      ...graphic,
      geometry: {
        ...graphic.geometry,
        coordinates: translateGeometryCoordinates(graphic.geometry.coordinates, longitudeOffset, latitudeOffset),
      } as typeof graphic.geometry,
    })),
    mapView: { center, zoom: deployment.mapView?.zoom ?? DEFAULT_MAP_ZOOM },
  };
}

export function translateSimulationResult(
  result: SimulationResult,
  longitudeOffset: number,
  latitudeOffset: number,
): SimulationResult {
  const translated = structuredClone(result) as SimulationResult;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.longitude === 'number' && typeof record.latitude === 'number') {
      record.longitude += longitudeOffset;
      record.latitude += latitudeOffset;
    }
    Object.values(record).forEach(visit);
  };
  visit(translated);
  return translated;
}
