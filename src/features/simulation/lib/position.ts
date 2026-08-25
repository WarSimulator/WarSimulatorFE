import { DEFAULT_MAP_CENTER } from './mapConfig';
import type { DeploymentPosition } from '../../../types';

export function getLngLat(position: DeploymentPosition): [number, number] {
  if (typeof position.longitude === 'number' && typeof position.latitude === 'number') {
    return [position.longitude, position.latitude];
  }

  if (typeof position.lon === 'number' && typeof position.lat === 'number') {
    return [position.lon, position.lat];
  }

  const x = typeof position.x === 'number' ? position.x : 50;
  const y = typeof position.y === 'number' ? position.y : 50;
  return [DEFAULT_MAP_CENTER[0] + (x - 50) * 0.01, DEFAULT_MAP_CENTER[1] - (y - 50) * 0.01];
}

export function createGeoPosition(longitude: number, latitude: number): DeploymentPosition {
  return {
    longitude,
    latitude,
    lon: longitude,
    lat: latitude,
  };
}
