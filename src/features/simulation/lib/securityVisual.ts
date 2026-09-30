import type { SimulationResultPosition } from '../../../types';

export type SecurityVisualPosition = Pick<SimulationResultPosition, 'latitude' | 'longitude'>;

const METERS_PER_LATITUDE_DEGREE = 111_000;

function pointAt(center: SecurityVisualPosition, radiusMeters: number, angleDegrees: number): [number, number] {
  const angle = angleDegrees * Math.PI / 180;
  const latitude = center.latitude + Math.cos(angle) * radiusMeters / METERS_PER_LATITUDE_DEGREE;
  const longitude = center.longitude + Math.sin(angle) * radiusMeters
    / (METERS_PER_LATITUDE_DEGREE * Math.max(0.1, Math.cos(center.latitude * Math.PI / 180)));
  return [longitude, latitude];
}

function arc(center: SecurityVisualPosition, radiusMeters: number, startDegrees: number, endDegrees: number, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, index) => (
    pointAt(center, radiusMeters, startDegrees + (endDegrees - startDegrees) * index / steps)
  ));
}

export function buildSecurityVisual(center: SecurityVisualPosition, elapsedSeconds: number, progress: number) {
  const intro = 1 - Math.pow(1 - Math.min(1, progress / 0.28), 3);
  const fieldRadiusMeters = 55 + 145 * intro;
  const pulsePhase = (elapsedSeconds * 0.55) % 1;
  const pulseRadiusMeters = 24 + (fieldRadiusMeters - 24) * pulsePhase;
  const rotationDegrees = elapsedSeconds * 32;
  const sectorWidthDegrees = 78;

  return {
    pulsePath: arc(center, pulseRadiusMeters, 0, 360, 36),
    boundaryPath: arc(center, fieldRadiusMeters, 0, 360, 48),
    pulseOpacity: 0.72 * (1 - pulsePhase),
    sectors: Array.from({ length: 3 }, (_, index) => {
      const centerAngle = rotationDegrees + index * 120;
      const start = centerAngle - sectorWidthDegrees / 2;
      const end = centerAngle + sectorWidthDegrees / 2;
      return [
        pointAt(center, 36, start),
        ...arc(center, fieldRadiusMeters, start, end),
        pointAt(center, 36, end),
        ...arc(center, 36, end, start, 5),
      ];
    }),
  };
}
