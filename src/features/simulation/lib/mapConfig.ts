import type { StyleSpecification } from 'maplibre-gl';

export const DEFAULT_MAP_CENTER: [number, number] = [-118.2437, 34.0522];
export const DEFAULT_MAP_ZOOM = 12;

export function getMapStyleUrl() {
  const env = (import.meta as unknown as { env?: { VITE_TACTICAL_MAP_STYLE_URL?: string; VITE_MAP_STYLE_URL?: string } }).env;
  return env?.VITE_TACTICAL_MAP_STYLE_URL ?? env?.VITE_MAP_STYLE_URL;
}

export function createDefaultMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint: {
          'raster-saturation': -0.9,
          'raster-contrast': 0.2,
          'raster-brightness-min': 0.08,
          'raster-brightness-max': 0.56,
        },
      },
    ],
  };
}
