export type SurfacePoint = { lat: number; lng: number; altitude?: number };
type Options = { path: SurfacePoint[] } & Record<string, unknown>;
type Kind = 'line' | 'polygon';
type Node = { remove(): void };

/** Retain Google elements and skip geometry setters when the input is unchanged. */
export function createOverlayStore(
  create: (kind: Kind, options: Options) => Node,
  append: (node: Node) => void,
  surfacePath: (points: SurfacePoint[]) => SurfacePoint[],
) {
  const entries = new Map<string, { node: Node; options: Options; kind: Kind }>();
  let active = new Set<string>();
  return {
    begin() { active = new Set(); },
    put(key: string, kind: Kind, options: Options) {
      active.add(key);
      let entry = entries.get(key);
      if (entry && entry.kind !== kind) {
        entry.node.remove();
        entries.delete(key);
        entry = undefined;
      }
      if (!entry) {
        const node = create(kind, { ...options, path: surfacePath(options.path) });
        append(node);
        entries.set(key, { node, options, kind });
        return;
      }
      const changes: Record<string, unknown> = {};
      const before = entry.options.path;
      if (before.length !== options.path.length || options.path.some((p, i) =>
        p.lat !== before[i].lat || p.lng !== before[i].lng || p.altitude !== before[i].altitude)) {
        changes.path = surfacePath(options.path);
      }
      for (const [property, value] of Object.entries(options)) {
        if (property !== 'path' && value !== entry.options[property]) changes[property] = value;
      }
      Object.assign(entry.node, changes);
      entry.options = options;
    },
    end() {
      for (const [key, entry] of entries) {
        if (!active.has(key)) { entry.node.remove(); entries.delete(key); }
      }
    },
    clear() { for (const entry of entries.values()) entry.node.remove(); entries.clear(); },
  };
}

/** Wall-clock throttle; seeks and paused snapshots must bypass the interval. */
export function createOverlaySchedule(intervalMs: number) {
  let lastTime = Number.NaN;
  let lastUpdate = -Infinity;
  return (timestamp: number, time: number, playing: boolean, force = false) => {
    if (!force && time === lastTime) return false;
    if (!force && playing && time >= lastTime && timestamp - lastUpdate < intervalMs) return false;
    lastTime = time;
    lastUpdate = timestamp;
    return true;
  };
}
