import type { StyleSpecification } from 'maplibre-gl';
import type { DeploymentSetup, SimulationResult } from '../../../types';
import manifest from '../../../../public/map-benchmark/manifest.json';
import { getLngLat } from './position';

export const OPERATION_BOUNDS = manifest.bounds as [number, number, number, number];
export const OPERATION_MAP_BOUNDS: [[number, number], [number, number]] = [
  [OPERATION_BOUNDS[0], OPERATION_BOUNDS[1]], [OPERATION_BOUNDS[2], OPERATION_BOUNDS[3]],
];
export const OPERATION_CENTER: [number, number] = [127.44, 38.44];
export const OPERATION_REGION_LABEL = '철원 작전 지역 (127.15~127.75°E, 38.25~38.70°N)';

export function isInOperationRegion(longitude: number, latitude: number) {
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= OPERATION_BOUNDS[0] && longitude <= OPERATION_BOUNDS[2]
    && latitude >= OPERATION_BOUNDS[1] && latitude <= OPERATION_BOUNDS[3];
}
export class OperationRegionError extends Error {}
export function assertOperationCoordinates(coordinates: readonly (readonly number[])[], label: string) {
  if (coordinates.some(point => !isInOperationRegion(point[0], point[1]))) {
    throw new OperationRegionError(`${label}에 로컬 지도 작전 지역 밖의 좌표가 있습니다. ${OPERATION_REGION_LABEL} 안의 배치·경로를 사용해 주세요.`);
  }
}
export function assertOperationDeployment(deployment: DeploymentSetup) {
  for (const unit of deployment.units) assertOperationCoordinates([getLngLat(unit.position)], `유닛 ${unit.designation}`);
  for (const objective of deployment.objectives) assertOperationCoordinates([getLngLat(objective.position)], `목표 ${objective.name}`);
  for (const graphic of deployment.tacticalGraphics) {
    const points = graphic.geometry.type === 'Polygon' ? graphic.geometry.coordinates.flat() : graphic.geometry.coordinates;
    assertOperationCoordinates(points, `도형 ${graphic.name ?? graphic.id}`);
  }
}
export function assertOperationResult(result: SimulationResult) {
  for (const track of result.unitTracks) {
    assertOperationCoordinates(track.segments.flatMap(segment => segment.keyframes.map(frame => [frame.position.longitude, frame.position.latitude])), `이동 경로 ${track.actor}`);
  }
  // Effects contain nested observation targets, origins and movement positions.
  const check = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(check); return; }
    const object = value as Record<string, unknown>;
    if ('longitude' in object && 'latitude' in object) {
      assertOperationCoordinates([[object.longitude as number, object.latitude as number]], '시뮬레이션 효과');
    }
    Object.values(object).forEach(check);
  };
  check(result);
}
export function operationValidationError(deployment?: DeploymentSetup, result?: SimulationResult) {
  try {
    if (deployment) assertOperationDeployment(deployment);
    if (result) assertOperationResult(result);
    return '';
  } catch (error) { return error instanceof Error ? error.message : String(error); }
}

export function createLocalOperationMapStyle(demZoom = manifest.terrainMaxZoom): StyleSpecification {
  const assets = `${import.meta.env.BASE_URL}map-benchmark`;
  return {
    version: 8, glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      base: { type: 'vector', tiles: [`${location.origin}${assets}/base/{z}/{x}/{y}.mvt`], bounds: OPERATION_BOUNDS, maxzoom: manifest.maxZoom, attribution: '© OpenStreetMap contributors · Protomaps' },
      terrainSource: { type: 'raster-dem', tiles: [`${location.origin}${assets}/terrain/{z}/{x}/{y}.webp`], bounds: OPERATION_BOUNDS, minzoom: 0, maxzoom: demZoom, tileSize: 512, encoding: 'terrarium', attribution: '© Mapterhorn' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#303d42' } },
      { id: 'earth', type: 'fill', source: 'base', 'source-layer': 'earth', paint: { 'fill-color': '#829078' } },
      { id: 'landuse', type: 'fill', source: 'base', 'source-layer': 'landuse', paint: { 'fill-color': '#64785e', 'fill-opacity': 0.3 } },
      { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#3b6374' } },
      { id: 'roads', type: 'line', source: 'base', 'source-layer': 'roads', paint: { 'line-color': '#c3b891', 'line-width': 1.2 } },
      { id: 'terrain-hillshade', type: 'hillshade', source: 'terrainSource', paint: { 'hillshade-shadow-color': '#182018', 'hillshade-highlight-color': '#c9d2b0', 'hillshade-exaggeration': 0.55 } },
    ],
    terrain: { source: 'terrainSource', exaggeration: 1.2 }, sky: {},
  };
}
export type OperationMapConfig = { style: StyleSpecification; bounds: [[number, number], [number, number]] };
