import type { DeploymentSetup, LineStringGeometry } from '../../../types';

export function toTacticalGraphicFeatureCollection(deployment?: DeploymentSetup): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (deployment?.tacticalGraphics ?? []).map((graphic) => ({
      type: 'Feature',
      id: graphic.id,
      properties: { id: graphic.id, type: graphic.type, name: graphic.name ?? '' },
      geometry: graphic.geometry,
    })),
  };
}

export function toTacticalGraphicAxisArrowFeatures(deployment?: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: (deployment?.tacticalGraphics ?? [])
      .filter((graphic) => graphic.type === 'axis' && graphic.geometry.type === 'LineString' && graphic.geometry.coordinates.length > 1)
      .map((graphic) => {
        const coordinates = (graphic.geometry as LineStringGeometry).coordinates;
        const end = coordinates[coordinates.length - 1];
        const previous = coordinates[coordinates.length - 2];
        const rotation = (Math.atan2(-(end[1] - previous[1]), end[0] - previous[0]) * 180) / Math.PI;
        return {
          type: 'Feature',
          id: `${graphic.id}-arrow`,
          properties: { rotation },
          geometry: { type: 'Point', coordinates: end },
        };
      }),
  };
}
