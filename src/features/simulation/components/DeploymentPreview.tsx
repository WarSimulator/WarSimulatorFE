import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { DeploymentSetup, LineStringGeometry } from '../../../types';
import { getLngLat } from '../lib/position';
import { createDefaultMapStyle, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getMapStyleUrl } from '../lib/mapConfig';
import { ensureAxisArrowImage, ensureMilitarySymbolImage, ensureObjectiveImage, getMilitarySymbolImageId } from '../lib/militarySymbolRegistry';
import {
  addDeploymentSourcesAndLayers,
  AXIS_ARROW_SOURCE_ID,
  GRAPHICS_SOURCE_ID,
  OBJECTIVE_SOURCE_ID,
  UNIT_SOURCE_ID,
} from '../lib/tacticalMapLayers';

type DeploymentPreviewProps = {
  deployment: DeploymentSetup;
};

const PREVIEW_SYMBOL_SCALE = 0.62;
const PREVIEW_FIT_PADDING = 44;
const PREVIEW_MAX_ZOOM = 15;
const SINGLE_POINT_ZOOM = 14;

function collectDeploymentCoordinates(deployment: DeploymentSetup): [number, number][] {
  const unitCoordinates = deployment.units.map((unit) => getLngLat(unit.position));
  const objectiveCoordinates = deployment.objectives.map((objective) => getLngLat(objective.position));
  const graphicCoordinates = deployment.tacticalGraphics.flatMap((graphic) => {
    if (graphic.geometry.type === 'LineString') {
      return graphic.geometry.coordinates;
    }

    return graphic.geometry.coordinates.flat();
  });

  return [...unitCoordinates, ...objectiveCoordinates, ...graphicCoordinates];
}

function toUnitFeatures(deployment: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: deployment.units.map((unit) => ({
      type: 'Feature',
      id: unit.id,
      properties: {
        id: unit.id,
        designation: unit.designation,
        sidc: unit.sidc,
        imageId: getMilitarySymbolImageId(unit.sidc),
        affiliation: unit.affiliation,
        unitType: unit.unitType,
        echelon: unit.echelon,
        symbolScale: (unit.symbolScale ?? 1) * PREVIEW_SYMBOL_SCALE,
      },
      geometry: { type: 'Point', coordinates: getLngLat(unit.position) },
    })),
  };
}

function toObjectiveFeatures(deployment: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: deployment.objectives.map((objective) => ({
      type: 'Feature',
      id: objective.id,
      properties: {
        id: objective.id,
        name: objective.name,
        symbolScale: PREVIEW_SYMBOL_SCALE,
      },
      geometry: { type: 'Point', coordinates: getLngLat(objective.position) },
    })),
  };
}

function toGraphicFeatureCollection(deployment: DeploymentSetup): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: deployment.tacticalGraphics.map((graphic) => ({
      type: 'Feature',
      id: graphic.id,
      properties: { id: graphic.id, type: graphic.type, name: graphic.name ?? '' },
      geometry: graphic.geometry,
    })),
  };
}

function toAxisArrowFeatures(deployment: DeploymentSetup): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: deployment.tacticalGraphics
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

function fitDeploymentBounds(map: MapLibreMap, deployment: DeploymentSetup) {
  const coordinates = collectDeploymentCoordinates(deployment);

  if (coordinates.length === 0) {
    map.jumpTo({
      center: deployment.mapView?.center ?? DEFAULT_MAP_CENTER,
      zoom: deployment.mapView?.zoom ?? DEFAULT_MAP_ZOOM,
    });
    return;
  }

  const bounds = coordinates.reduce(
    (currentBounds, coordinate) => currentBounds.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
  );

  if (bounds.getNorth() === bounds.getSouth() && bounds.getEast() === bounds.getWest()) {
    map.jumpTo({ center: coordinates[0], zoom: SINGLE_POINT_ZOOM });
    return;
  }

  map.fitBounds(bounds, {
    padding: PREVIEW_FIT_PADDING,
    maxZoom: PREVIEW_MAX_ZOOM,
    duration: 0,
  });
}

export function DeploymentPreview({ deployment }: DeploymentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const unitSidcs = useMemo(() => deployment.units.map((unit) => unit.sidc).join('|'), [deployment.units]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl() ?? createDefaultMapStyle(),
      center: deployment.mapView?.center ?? DEFAULT_MAP_CENTER,
      zoom: deployment.mapView?.zoom ?? DEFAULT_MAP_ZOOM,
      attributionControl: false,
      interactive: false,
    });

    mapRef.current = map;

    const handleLoad = async () => {
      try {
        await ensureObjectiveImage(map);
        await ensureAxisArrowImage(map);
        await Promise.all(deployment.units.map((unit) => ensureMilitarySymbolImage(map, unit.sidc)));
        addDeploymentSourcesAndLayers(map);
        setMapReady(true);
      } catch (error) {
        console.error(error);
        setMapError(true);
      }
    };

    map.once('load', handleLoad);
    map.on('error', () => setMapError(true));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    void Promise.all(deployment.units.map((unit) => ensureMilitarySymbolImage(map, unit.sidc))).then(() => {
      (map.getSource(UNIT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toUnitFeatures(deployment));
      (map.getSource(OBJECTIVE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toObjectiveFeatures(deployment));
      (map.getSource(GRAPHICS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toGraphicFeatureCollection(deployment));
      (map.getSource(AXIS_ARROW_SOURCE_ID) as GeoJSONSource | undefined)?.setData(toAxisArrowFeatures(deployment));
      fitDeploymentBounds(map, deployment);
      map.resize();
    });
  }, [deployment, mapReady, unitSidcs]);

  if (mapError) {
    return (
      <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded border border-outline-variant bg-[#161616]">
        <div className="max-w-[320px] text-center">
          <p className="font-label-caps text-label-caps text-error">MAP UNAVAILABLE</p>
          <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Unable to load the deployment preview map source.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[300px] flex-1 overflow-hidden rounded border border-outline-variant bg-[#161616]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-surface/20 mix-blend-multiply" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="absolute bottom-2 right-2 rounded border border-outline-variant bg-surface/80 px-2 py-1 font-data-mono text-[9px] text-outline">
        DEPLOYMENT PREVIEW
      </div>
    </div>
  );
}
