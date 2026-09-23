import type { AtomicActionEffect, DeploymentSetup, SimulationResult, SimulationResultPosition } from '../../../types';
import { getUnitPositionAtTime } from './playback';
import { resolvePlanReference } from './planReferenceMapping';

type Position3D = { lat: number; lng: number; altitude?: number };
type MarkerNode = HTMLElement & { position: Position3D };
type ModelNode = HTMLElement & { position: Position3D };
type VfxLibrary = {
  Marker3DInteractiveElement: new (options: Record<string, unknown>) => MarkerNode;
  Model3DElement?: new (options: Record<string, unknown>) => ModelNode;
};

type SpriteDefinition = {
  src: string;
  frameBase: string;
  frames: number;
  columns: number;
  rows: number;
};

type SpriteNode = {
  kind: 'sprite';
  node: MarkerNode;
  definition: SpriteDefinition;
  size: number;
  frame: number;
  filter: string;
};

type ModelVfxNode = { kind: 'model'; node: ModelNode };
type VfxNode = SpriteNode | ModelVfxNode;

const EXPLOSION: SpriteDefinition = { src: '/vfx/sprites/explosion.webp', frameBase: '/vfx/frames/explosion', frames: 32, columns: 8, rows: 4 };
const SMOKE: SpriteDefinition = { src: '/vfx/sprites/smoke.webp', frameBase: '/vfx/frames/smoke', frames: 32, columns: 8, rows: 4 };
const REPEATED_IMPACT_ACTIONS = new Set(['Engage', 'Continue to Engage', 'Fight', 'Ambush', 'Disrupt']);
const VFX_ACTIONS = new Set([...REPEATED_IMPACT_ACTIONS, 'Destroy', 'Breach']);
const POST_ACTION_SMOKE_SECONDS = 10;
const embeddedFrames = new Map<string, string>();
let framePreparation: Promise<void> | undefined;

function prepareFrames() {
  if (framePreparation) return framePreparation;
  const sources = [EXPLOSION, SMOKE].flatMap(definition =>
    Array.from({ length: definition.frames }, (_, frame) => `${definition.frameBase}/frame-${String(frame).padStart(2, '0')}.png`),
  );
  framePreparation = Promise.all(sources.map(async source => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`VFX frame load failed: ${source}`);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error(`VFX frame decode failed: ${source}`));
      reader.readAsDataURL(blob);
    });
    embeddedFrames.set(source, dataUrl);
  })).then(() => undefined);
  return framePreparation;
}

function position3D(position: SimulationResultPosition, altitude = 4): Position3D {
  return { lat: position.latitude, lng: position.longitude, altitude };
}

function referencedPosition(effect: AtomicActionEffect, result: SimulationResult, deployment: DeploymentSetup | undefined, time: number) {
  const reference = [effect.parameters.target, effect.parameters.destination, effect.parameters.effectArea]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (reference) {
    const resolved = getUnitPositionAtTime(reference, time, result, deployment) ?? resolvePlanReference(deployment, reference);
    if (resolved) return resolved;
  }
  return getUnitPositionAtTime(effect.unitId, time, result, deployment)
    ?? getUnitPositionAtTime(effect.actor, time, result, deployment)
    ?? effect.origin;
}

function setSpriteFrame(entry: SpriteNode, progress: number) {
  const frame = Math.max(0, Math.min(entry.definition.frames - 1, Math.floor(progress * entry.definition.frames)));
  if (frame === entry.frame) return;
  entry.frame = frame;
  renderSprite(entry);
}

function renderSprite(entry: SpriteNode) {
  const frame = Math.max(0, entry.frame);
  const template = document.createElement('template');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.tacticalVfx = entry.filter.includes('sepia') ? 'dust' : entry.definition === SMOKE ? 'smoke' : 'explosion';
  svg.dataset.frame = String(frame);
  svg.setAttribute('width', String(entry.size));
  svg.setAttribute('height', String(entry.size));
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.style.filter = entry.filter;
  const image = document.createElementNS(svg.namespaceURI, 'image');
  const source = `${entry.definition.frameBase}/frame-${String(frame).padStart(2, '0')}.png`;
  image.setAttribute('href', embeddedFrames.get(source) ?? source);
  image.setAttribute('width', '256');
  image.setAttribute('height', '256');
  svg.append(image);
  template.content.append(svg);
  // Google 3D markers rasterize template content. Replacing the template when
  // the frame changes keeps the sprite tied to the simulation clock.
  entry.node.replaceChildren(template);
}

function createSprite(
  library: VfxLibrary,
  map: HTMLElement,
  position: Position3D,
  definition: SpriteDefinition,
  size: number,
  className: string,
) {
  const node = new library.Marker3DInteractiveElement({
    position,
    altitudeMode: 'RELATIVE_TO_GROUND',
    drawsWhenOccluded: true,
    collisionBehavior: 'REQUIRED',
    sizePreserved: true,
    zIndex: 400,
  });
  node.style.pointerEvents = 'none';
  map.append(node);
  return {
    kind: 'sprite', node, definition, size, frame: -1,
    filter: className === 'smoke' ? 'drop-shadow(0 3px 5px rgba(0,0,0,.7))' : 'saturate(1.8) contrast(1.15) drop-shadow(0 0 8px rgba(255,94,0,.85))',
  } satisfies SpriteNode;
}

export function createGoogle3DTacticalVfxStore(
  library: VfxLibrary,
  map: HTMLElement,
  result: SimulationResult,
  deployment?: DeploymentSetup,
) {
  const nodes = new Map<string, VfxNode>();
  let disposed = false;
  let lastTime = result.startTime;

  const putSprite = (key: string, position: Position3D, definition: SpriteDefinition, size: number, progress: number, className: string) => {
    let entry = nodes.get(key);
    if (entry?.kind !== 'sprite' || entry.definition !== definition || entry.size !== size) {
      entry?.node.remove();
      entry = createSprite(library, map, position, definition, size, className);
      nodes.set(key, entry);
    }
    entry.node.position = position;
    if (!entry.node.isConnected) map.append(entry.node);
    setSpriteFrame(entry, progress);
  };

  const putModel = (key: string, position: Position3D, src: string, scale: number, heading: number) => {
    if (!library.Model3DElement) return;
    let entry = nodes.get(key);
    if (entry?.kind !== 'model') {
      entry?.node.remove();
      const node = new library.Model3DElement({
        src,
        position,
        scale,
        orientation: { heading, tilt: 0, roll: 0 },
        altitudeMode: 'CLAMP_TO_GROUND',
      });
      node.style.pointerEvents = 'none';
      map.append(node);
      entry = { kind: 'model', node };
      nodes.set(key, entry);
    }
    entry.node.position = position;
    if (!entry.node.isConnected) map.append(entry.node);
  };

  const update = (time: number) => {
    lastTime = time;
    const activeKeys = new Set<string>();
    for (const effect of result.actionEffects ?? []) {
      if (!VFX_ACTIONS.has(effect.action) || time < effect.startTime) continue;
      const duration = Math.max(0.01, effect.endTime - effect.startTime);
      const sampleTime = Math.min(time, effect.endTime - 0.001);
      const resolved = referencedPosition(effect, result, deployment, sampleTime);
      const position = position3D(resolved);
      const prefix = `vfx:${effect.unitId}:${effect.actionSequence}`;

      if (REPEATED_IMPACT_ACTIONS.has(effect.action) && time < effect.endTime) {
        const key = `${prefix}:impact`;
        const cycle = effect.action === 'Fight' ? 1.05 : 1.35;
        const progress = ((time - effect.startTime) % cycle) / cycle;
        putSprite(key, position, EXPLOSION, effect.action === 'Fight' ? 116 : 86, progress, 'explosion');
        activeKeys.add(key);
      }

      if (effect.action === 'Destroy') {
        if (time < effect.endTime) {
          const key = `${prefix}:blast`;
          putSprite(key, position, EXPLOSION, 154, Math.min(0.999, (time - effect.startTime) / duration), 'explosion');
          activeKeys.add(key);
        }
        if (time >= effect.startTime + duration * 0.35 && time <= effect.endTime + POST_ACTION_SMOKE_SECONDS) {
          const key = `${prefix}:smoke`;
          const smokeTime = time - (effect.startTime + duration * 0.35);
          putSprite(key, { ...position, altitude: 7 }, SMOKE, 132, (smokeTime % 2.4) / 2.4, 'smoke');
          activeKeys.add(key);
        }
        if (time >= effect.endTime) {
          const debrisKey = `${prefix}:debris`;
          const craterKey = `${prefix}:crater`;
          putModel(debrisKey, position, '/vfx/models/debris-01.glb', 3.2, effect.actionSequence * 137 % 360);
          putModel(craterKey, position, '/vfx/models/crater-01.glb', 3.8, effect.actionSequence * 83 % 360);
          activeKeys.add(debrisKey);
          activeKeys.add(craterKey);
        }
      }

      if (effect.action === 'Breach' && time <= effect.endTime + 4) {
        const key = `${prefix}:dust`;
        const progress = ((time - effect.startTime) % 2.4) / 2.4;
        putSprite(key, position, SMOKE, 110, progress, 'smoke');
        entryStyle(nodes.get(key), 'sepia(.7) saturate(1.35) brightness(1.2) drop-shadow(0 3px 5px rgba(0,0,0,.65))');
        activeKeys.add(key);
      }
    }

    for (const [key, entry] of nodes) {
      if (activeKeys.has(key)) continue;
      entry.node.remove();
      nodes.delete(key);
    }
  };

  void prepareFrames().then(() => {
    if (disposed) return;
    nodes.forEach(entry => { if (entry.kind === 'sprite') entry.frame = -1; });
    update(lastTime);
  }).catch(error => console.warn(error));

  return {
    update,
    clear() {
      disposed = true;
      nodes.forEach(entry => entry.node.remove());
      nodes.clear();
    },
  };
}

function entryStyle(entry: VfxNode | undefined, filter: string) {
  if (entry?.kind !== 'sprite' || entry.filter === filter) return;
  entry.filter = filter;
  renderSprite(entry);
}
