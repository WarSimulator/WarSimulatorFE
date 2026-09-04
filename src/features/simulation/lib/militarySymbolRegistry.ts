import type { Map as MapLibreMap } from 'maplibre-gl';
import { createMilitarySymbolSvg, createObjectiveSvg } from './symbolSvg';

const registeredImages = new WeakMap<MapLibreMap, Set<string>>();

function getRegistry(map: MapLibreMap) {
  let registry = registeredImages.get(map);
  if (!registry) {
    registry = new Set<string>();
    registeredImages.set(map, registry);
  }
  return registry;
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterize SVG image'));
    };
    image.src = url;
  });
}

export function getMilitarySymbolImageId(sidc: string, standard: '2525' | 'APP6' = '2525') {
  return `mil-symbol-${standard}-${sidc.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export const OBJECTIVE_IMAGE_ID = 'objective-symbol';
export const AXIS_ARROW_IMAGE_ID = 'axis-arrow-symbol';

export async function ensureMilitarySymbolImage(map: MapLibreMap, sidc: string, standard: '2525' | 'APP6' = '2525') {
  const imageId = getMilitarySymbolImageId(sidc, standard);
  const registry = getRegistry(map);

  if (map.hasImage(imageId) || registry.has(imageId)) {
    return imageId;
  }

  const image = await svgToImage(createMilitarySymbolSvg(sidc, 64, undefined, standard));
  if (!map.hasImage(imageId)) {
    map.addImage(imageId, image);
  }
  registry.add(imageId);
  return imageId;
}

export async function ensureObjectiveImage(map: MapLibreMap) {
  const registry = getRegistry(map);
  if (map.hasImage(OBJECTIVE_IMAGE_ID) || registry.has(OBJECTIVE_IMAGE_ID)) {
    return OBJECTIVE_IMAGE_ID;
  }

  const image = await svgToImage(createObjectiveSvg(64));
  if (!map.hasImage(OBJECTIVE_IMAGE_ID)) {
    map.addImage(OBJECTIVE_IMAGE_ID, image);
  }
  registry.add(OBJECTIVE_IMAGE_ID);
  return OBJECTIVE_IMAGE_ID;
}

export async function ensureAxisArrowImage(map: MapLibreMap) {
  const registry = getRegistry(map);
  if (map.hasImage(AXIS_ARROW_IMAGE_ID) || registry.has(AXIS_ARROW_IMAGE_ID)) {
    return AXIS_ARROW_IMAGE_ID;
  }

  const image = await svgToImage(`<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M36 24 14 11v26z" fill="#ffb95f" stroke="#121212" stroke-width="2" stroke-linejoin="round"/>
  </svg>`);
  if (!map.hasImage(AXIS_ARROW_IMAGE_ID)) {
    map.addImage(AXIS_ARROW_IMAGE_ID, image);
  }
  registry.add(AXIS_ARROW_IMAGE_ID);
  return AXIS_ARROW_IMAGE_ID;
}
