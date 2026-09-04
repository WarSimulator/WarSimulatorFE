import { TASK_SOURCE_ID } from '../hooks/useTacticalTaskLayer';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { AXIS_ARROW_IMAGE_ID, OBJECTIVE_IMAGE_ID } from './militarySymbolRegistry';

export const UNIT_SOURCE_ID = 'deployment-units';
export const OBJECTIVE_SOURCE_ID = 'deployment-objectives';
export const GRAPHICS_SOURCE_ID = 'deployment-graphics';
export const AXIS_ARROW_SOURCE_ID = 'deployment-axis-arrows';
export const OBSERVATION_SECTOR_SOURCE_ID = 'observation-sector-source';

export function addDeploymentSourcesAndLayers(map: MapLibreMap) {
  map.addSource(UNIT_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(OBJECTIVE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(GRAPHICS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(AXIS_ARROW_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(OBSERVATION_SECTOR_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  map.addSource(TASK_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'task-fill', type: 'fill', source: TASK_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': ['coalesce', ['get', 'fillColor'], ['get', 'color']], 'fill-opacity': 0.2 } });
  map.addLayer({ id: 'task-selected-lines', type: 'line', source: TASK_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#ffb95f', 'line-width': 12, 'line-opacity': 0.55 } });
  map.addLayer({ id: 'task-halo', type: 'line', source: TASK_SOURCE_ID,
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': '#111827', 'line-width': ['+', ['get', 'width'], 3] } });
  map.addLayer({ id: 'task-lines', type: 'line', source: TASK_SOURCE_ID,
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] } });
  map.addLayer({ id: 'task-labels', type: 'symbol', source: TASK_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': ['get', 'label'], 'text-size': 14, 'text-font': ['Noto Sans Regular'],
      'text-rotate': ['get', 'rotation'], 'text-rotation-alignment': 'map', 'text-allow-overlap': true },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#111827', 'text-halo-width': 2 } });
  map.addLayer({
    id: 'deployment-area-fill',
    type: 'fill',
    source: GRAPHICS_SOURCE_ID,
    filter: ['==', ['get', 'type'], 'area'],
    paint: { 'fill-color': '#ffb95f', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'deployment-area-line',
    type: 'line',
    source: GRAPHICS_SOURCE_ID,
    filter: ['==', ['get', 'type'], 'area'],
    paint: { 'line-color': '#ffb95f', 'line-width': 2 },
  });
  map.addLayer({
    id: 'deployment-lines',
    type: 'line',
    source: GRAPHICS_SOURCE_ID,
    filter: ['!=', ['get', 'type'], 'area'],
    paint: {
      'line-color': ['match', ['get', 'type'], 'axis', '#ffb95f', 'phase-line', '#f5f5f5', 'boundary', '#888888', 'freehand', '#ffb95f', '#b4c5ff'],
      'line-width': ['match', ['get', 'type'], 'axis', 3, 'freehand', 2.5, 'route', 2, 2],
      'line-dasharray': ['match', ['get', 'type'], 'phase-line', ['literal', [8, 4]], 'boundary', ['literal', [4, 3]], 'route', ['literal', [2, 2]], ['literal', [1, 0]]],
    },
  });
  map.addLayer({
    id: 'deployment-selected-lines',
    type: 'line',
    source: GRAPHICS_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#ffb95f', 'line-width': 7, 'line-opacity': 0.35 },
  });
  map.addLayer({
    id: 'deployment-phase-labels',
    type: 'symbol',
    source: GRAPHICS_SOURCE_ID,
    filter: ['==', ['get', 'type'], 'phase-line'],
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-size': 12,
      'text-font': ['Noto Sans Regular'],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#f5f5f5', 'text-halo-color': '#121212', 'text-halo-width': 2 },
  });
  map.addLayer({
    id: 'observation-sector-fill',
    type: 'fill',
    source: OBSERVATION_SECTOR_SOURCE_ID,
    paint: { 'fill-color': '#b4c5ff', 'fill-opacity': 0.08 },
  });
  map.addLayer({
    id: 'observation-sector-outline',
    type: 'line',
    source: OBSERVATION_SECTOR_SOURCE_ID,
    paint: { 'line-color': '#b4c5ff', 'line-width': 1.25, 'line-opacity': 0.5 },
  });
  map.addLayer({
    id: 'deployment-axis-arrows',
    type: 'symbol',
    source: AXIS_ARROW_SOURCE_ID,
    layout: {
      'icon-image': AXIS_ARROW_IMAGE_ID,
      'icon-size': 0.55,
      'icon-rotate': ['get', 'rotation'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  map.addLayer({
    id: 'deployment-objectives',
    type: 'symbol',
    source: OBJECTIVE_SOURCE_ID,
    layout: {
      'icon-image': OBJECTIVE_IMAGE_ID,
      'icon-size': ['coalesce', ['get', 'symbolScale'], 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-font': ['Noto Sans Regular'],
      'text-offset': [0, 1.9],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffb95f', 'text-halo-color': '#121212', 'text-halo-width': 2 },
  });
  map.addLayer({
    id: 'deployment-units',
    type: 'symbol',
    source: UNIT_SOURCE_ID,
    layout: {
      'icon-image': ['get', 'imageId'],
      'icon-size': ['coalesce', ['get', 'symbolScale'], 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'designation'],
      'text-size': 10,
      'text-font': ['Noto Sans Regular'],
      'text-offset': [0, 2.15],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#e3e3e3', 'text-halo-color': '#121212', 'text-halo-width': 2 },
  });
  map.addLayer({
    id: 'deployment-selected-points',
    type: 'circle',
    source: UNIT_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 30, 'circle-color': '#ffb95f', 'circle-opacity': 0.16, 'circle-stroke-color': '#ffb95f', 'circle-stroke-width': 1 },
  });
}
