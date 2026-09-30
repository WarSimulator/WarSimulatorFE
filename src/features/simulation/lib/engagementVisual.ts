type Point3D = { lat: number; lng: number; altitude?: number };
type LineOptions = { path: Point3D[] } & Record<string, unknown>;
type LineStore = {
  begin(): void;
  put(key: string, kind: 'line', options: LineOptions): void;
  end(): void;
};

export type ActiveEngagement = {
  key: string;
  origin: Point3D;
  target: Point3D;
};

const RING_POINTS = 32;
const RING_UNIT_CIRCLE = Array.from({ length: RING_POINTS + 1 }, (_, index) => {
  const angle = index / RING_POINTS * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const RING_PERIOD_SECONDS = 1.25;
const RING_RADIUS_MIN_METERS = 12;
const RING_RADIUS_MAX_METERS = 115;

function impactRingPath(center: Point3D, radiusMeters: number): Point3D[] {
  const latitudeScale = radiusMeters / 111_000;
  const longitudeScale = radiusMeters / (111_000 * Math.max(0.1, Math.cos(center.lat * Math.PI / 180)));
  return RING_UNIT_CIRCLE.map(([north, east]) => ({
    lat: center.lat + north * latitudeScale,
    lng: center.lng + east * longitudeScale,
    altitude: 2, // Lift only enough to avoid z-fighting with the visible terrain mesh.
  }));
}

/** Google Maps 3D has no scene-owned Vector3: lat/lng/altitude are its live 3D vertices. */
export class EngagementVisual {
  private elapsedSeconds = 0;

  update(deltaTime: number, engagements: readonly ActiveEngagement[], nodes: LineStore, linkAltitudeMeters: number): void {
    if (Number.isFinite(deltaTime)) this.elapsedSeconds = ((this.elapsedSeconds + deltaTime) % RING_PERIOD_SECONDS + RING_PERIOD_SECONDS) % RING_PERIOD_SECONDS;
    nodes.begin();

    for (const { key, origin, target } of engagements) {
      if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) continue;
      // Reuse one map element per beam; the overlay store only changes vertices when the units move.
      const blink = 0.5 + 0.5 * Math.sin(this.elapsedSeconds / RING_PERIOD_SECONDS * Math.PI * 16);
      nodes.put(`${key}:beam`, 'line', {
        path: [
          { lat: origin.lat, lng: origin.lng, altitude: 2 },
          { lat: origin.lat, lng: origin.lng, altitude: linkAltitudeMeters },
          { lat: target.lat, lng: target.lng, altitude: linkAltitudeMeters },
          { lat: target.lat, lng: target.lng, altitude: 2 },
        ],
        strokeColor: `rgba(255, 56, 64, ${(0.55 + blink * 0.45).toFixed(3)})`,
        strokeWidth: 4 + blink * 4,
        altitudeMode: 'RELATIVE_TO_MESH', drawsOccludedSegments: false, zIndex: 35,
      });

      // Two staggered rings provide a continuous impact rhythm with no textures or assets.
      for (let index = 0; index < 2; index += 1) {
        const progress = ((this.elapsedSeconds / RING_PERIOD_SECONDS) + index * 0.5) % 1;
        const radius = RING_RADIUS_MIN_METERS + (RING_RADIUS_MAX_METERS - RING_RADIUS_MIN_METERS) * progress;
        nodes.put(`${key}:impact:${index}`, 'line', {
          path: impactRingPath(target, radius),
          strokeColor: `rgba(255, 45, 55, ${(0.8 * (1 - progress)).toFixed(3)})`,
          strokeWidth: 2 + 3 * (1 - progress),
          altitudeMode: 'RELATIVE_TO_MESH', drawsOccludedSegments: false, zIndex: 36,
        });
      }
    }

    nodes.end();
  }
}
