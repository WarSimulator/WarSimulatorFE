import type { TacticalGraphic } from '../../../types';
type Coordinate = [number, number];
const radians = Math.PI / 180;
export function graphicCoordinates(graphic: TacticalGraphic): Coordinate[] {
  return graphic.geometry.type === 'LineString' ? graphic.geometry.coordinates : graphic.geometry.coordinates.flat();
}
// Rotate in the map's Mercator plane, rather than distorting longitude/latitude degrees.
export function toRotationPlane([longitude, latitude]: Coordinate, referenceLongitude: number): Coordinate {
  const unwrapped = referenceLongitude + ((longitude - referenceLongitude + 540) % 360) - 180;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * radians;
  return [unwrapped * radians, -Math.log(Math.tan(Math.PI / 4 + lat / 2))];
}
function fromRotationPlane([x, y]: Coordinate): Coordinate {
  return [x / radians, (2 * Math.atan(Math.exp(-y)) - Math.PI / 2) / radians];
}
export function rotationCenter(graphic: TacticalGraphic): Coordinate {
  const coordinates = graphicCoordinates(graphic);
  const reference = coordinates[0][0];
  const projected = coordinates.map(p => toRotationPlane(p, reference));
  return fromRotationPlane([
    (Math.min(...projected.map(p => p[0])) + Math.max(...projected.map(p => p[0]))) / 2,
    (Math.min(...projected.map(p => p[1])) + Math.max(...projected.map(p => p[1]))) / 2,
  ]);
}
export function rotateGraphic(graphic: TacticalGraphic, angle: number, center = rotationCenter(graphic)): TacticalGraphic {
  const pivot = toRotationPlane(center, center[0]);
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const rotate = (coordinate: Coordinate): Coordinate => {
    const point = toRotationPlane(coordinate, center[0]);
    const x = point[0] - pivot[0], y = point[1] - pivot[1];
    return fromRotationPlane([pivot[0] + x * cosine - y * sine, pivot[1] + x * sine + y * cosine]);
  };
  return { ...graphic, geometry: graphic.geometry.type === 'LineString'
    ? { type: 'LineString', coordinates: graphic.geometry.coordinates.map(rotate) }
    : { type: 'Polygon', coordinates: graphic.geometry.coordinates.map(ring => ring.map(rotate)) } };
}
