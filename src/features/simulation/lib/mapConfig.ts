import type { StyleSpecification } from 'maplibre-gl';

export const DEFAULT_MAP_CENTER: [number, number] = [126.9780, 37.5665];
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

/** MapLibre's official 3D terrain pattern: raster basemap + raster DEM + hillshade. */
export function create3DTerrainMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
      },
      terrainSource: {
        type: 'raster-dem',
        url: 'https://tiles.mapterhorn.com/tilejson.json',
      },
      hillshadeSource: {
        type: 'raster-dem',
        url: 'https://tiles.mapterhorn.com/tilejson.json',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint: {
          'raster-saturation': -0.55,
          'raster-contrast': 0.15,
          'raster-brightness-min': 0.12,
          'raster-brightness-max': 0.72,
        },
      },
      {
        id: 'terrain-hillshade',
        type: 'hillshade',
        source: 'hillshadeSource',
        paint: {
          'hillshade-shadow-color': '#182018',
          'hillshade-highlight-color': '#c9d2b0',
          'hillshade-exaggeration': 0.55,
        },
      },
    ],
    terrain: { source: 'terrainSource', exaggeration: 1.2 },
    sky: {},
  };
}
