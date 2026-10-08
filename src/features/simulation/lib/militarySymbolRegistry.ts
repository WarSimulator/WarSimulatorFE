import type { Map as MapLibreMap } from 'maplibre-gl';
import { createMilitarySymbolSvg, createObjectiveSvg, get3DUnitSymbolSize } from './symbolSvg';

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

async function svgToNormalizedImageData(svg: string) {
  const image = await svgToImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('군대부호 캔버스를 만들지 못했습니다.');
  const scale = Math.min(116 / Math.max(1, image.naturalWidth), 116 / Math.max(1, image.naturalHeight));
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
  return context.getImageData(0, 0, 128, 128);
}

export function getMilitarySymbolImageId(sidc: string, standard: '2525' | 'APP6' = '2525', normalized3D = false) {
  return `mil-symbol-${normalized3D ? '3d-' : ''}${standard.toLowerCase()}-${sidc.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export const OBJECTIVE_IMAGE_ID = 'objective-symbol';
export const AXIS_ARROW_IMAGE_ID = 'axis-arrow-symbol';
export const EXPLOSION_FRAME_COUNT = 32;

export function getExplosionFrameImageId(frame: number) {
  return `explosion-frame-${String(frame % EXPLOSION_FRAME_COUNT).padStart(2, '0')}`;
}

export async function ensureMilitarySymbolImage(map: MapLibreMap, sidc: string, standard: '2525' | 'APP6' = '2525', normalized3D = false) {
  const imageId = getMilitarySymbolImageId(sidc, standard, normalized3D);
  const registry = getRegistry(map);

  if (map.hasImage(imageId) || registry.has(imageId)) {
    return imageId;
  }

  const image = normalized3D
    ? await svgToNormalizedImageData(createMilitarySymbolSvg(sidc, get3DUnitSymbolSize(1), undefined, standard))
    : await svgToImage(createMilitarySymbolSvg(sidc, 64, undefined, standard));
  if (!map.hasImage(imageId)) {
    map.addImage(imageId, image);
  }
  registry.add(imageId);
  return imageId;
}

export async function ensureExplosionFrameImages(map: MapLibreMap) {
  const registry = getRegistry(map);
  await Promise.all(Array.from({ length: EXPLOSION_FRAME_COUNT }, async (_, frame) => {
    const imageId = getExplosionFrameImageId(frame);
    if (map.hasImage(imageId) || registry.has(imageId)) return;
    const response = await map.loadImage(`${import.meta.env.BASE_URL}vfx/frames/explosion/frame-${String(frame).padStart(2, '0')}.png`);
    const canvas = document.createElement('canvas');
    canvas.width = 112;
    canvas.height = 112;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('폭발 효과 캔버스를 만들지 못했습니다.');
    context.drawImage(response.data, 0, 0, 112, 112);
    if (!map.hasImage(imageId)) map.addImage(imageId, context.getImageData(0, 0, 112, 112));
    registry.add(imageId);
  }));
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
