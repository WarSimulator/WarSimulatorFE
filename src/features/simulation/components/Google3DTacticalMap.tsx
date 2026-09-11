import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeploymentSetup, SimulationResult, SimulationRuntimeState, SimulationUnit } from '../../../types';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { getTrackPositionsAtTime } from '../lib/playback';
import { createMilitarySymbolSvg } from '../lib/symbolSvg';

type Props = {
  runtime: SimulationRuntimeState;
  playbackRef?: { current: SimulationRuntimeState };
  units: SimulationUnit[];
  result: SimulationResult;
  deployment?: DeploymentSetup;
  onSelectUnit: (unitId: string) => void;
};

export type Position3D = { lat: number; lng: number; altitude?: number };
export type Map3DNode = HTMLElement;
export type Marker3DNode = HTMLElement & { position: Position3D; label?: string; zIndex?: number };
export type Maps3DLibrary = {
  Map3DElement: new (options: Record<string, unknown>) => Map3DNode;
  Marker3DInteractiveElement: new (options: Record<string, unknown>) => Marker3DNode;
  Polyline3DElement: new (options: Record<string, unknown>) => HTMLElement;
  Polygon3DElement: new (options: Record<string, unknown>) => HTMLElement;
};
type GoogleMapsRuntime = { maps: { importLibrary: (name: string) => Promise<unknown> } };

let googleMapsLoad: Promise<GoogleMapsRuntime> | undefined;

export function loadGoogleMaps(apiKey: string) {
  const current = (window as Window & { google?: GoogleMapsRuntime }).google;
  if (current?.maps?.importLibrary) return Promise.resolve(current);
  if (googleMapsLoad) return googleMapsLoad;
  googleMapsLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.atlasGoogleMaps = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=beta&libraries=maps3d`;
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { google?: GoogleMapsRuntime }).google;
      if (loaded?.maps?.importLibrary) resolve(loaded);
      else reject(new Error('Google Maps API가 초기화되지 않았습니다.'));
    };
    script.onerror = () => reject(new Error('Google Maps API를 불러오지 못했습니다.'));
    document.head.append(script);
  });
  return googleMapsLoad;
}

function getCenter(result: SimulationResult, deployment?: DeploymentSetup): Position3D {
  const configured = deployment?.mapView?.center;
  if (configured) return { lng: configured[0], lat: configured[1], altitude: 0 };
  const positions = result.unitTracks.flatMap(track => track.segments.flatMap(segment => segment.keyframes.map(frame => frame.position)));
  if (!positions.length) return { lng: DEFAULT_MAP_CENTER[0], lat: DEFAULT_MAP_CENTER[1], altitude: 0 };
  return {
    lng: positions.reduce((sum, position) => sum + position.longitude, 0) / positions.length,
    lat: positions.reduce((sum, position) => sum + position.latitude, 0) / positions.length,
    altitude: 0,
  };
}

function getCameraRange(result: SimulationResult, center: Position3D) {
  const positions = result.unitTracks.flatMap(track => track.segments.flatMap(segment => segment.keyframes.map(frame => frame.position)));
  const farthest = positions.reduce((maximum, position) => {
    const latitudeMeters = (position.latitude - center.lat) * 111_000;
    const longitudeMeters = (position.longitude - center.lng) * 111_000 * Math.cos(center.lat * Math.PI / 180);
    return Math.max(maximum, Math.hypot(latitudeMeters, longitudeMeters));
  }, 0);
  return Math.max(1_500, Math.min(30_000, farthest * 3));
}

function positionsAtTime(result: SimulationResult, units: SimulationUnit[], time: number) {
  const moving = getTrackPositionsAtTime(result, time);
  const movingIds = new Set(moving.map(item => item.unitId));
  return [
    ...moving.flatMap(item => item.position ? [{ ...item, position: item.position }] : []),
    ...units.flatMap(unit => {
      const position = unit.geographicPosition;
      return !movingIds.has(unit.id) && position
        ? [{ unitId: unit.id, actor: unit.name, position }]
        : [];
    }),
  ];
}

function markerText(value?: string) {
  const text = value?.trim();
  return text ? { label: text, title: text } : {};
}

export function Google3DTacticalMap({ runtime, playbackRef, units, result, deployment, onSelectUnit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DNode | null>(null);
  const markersRef = useRef(new Map<string, Marker3DNode>());
  const fallbackPlaybackRef = useRef(runtime);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const center = useMemo(() => getCenter(result, deployment), [deployment, result]);
  const cameraRange = useMemo(() => getCameraRange(result, center), [center, result]);
  useEffect(() => { fallbackPlaybackRef.current = runtime; }, [runtime]);
  const clock = playbackRef ?? fallbackPlaybackRef;

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setError('VITE_GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.');
      return;
    }
    let cancelled = false;
    const initialize = async () => {
      try {
        const google = await loadGoogleMaps(apiKey);
        const library = await google.maps.importLibrary('maps3d') as Maps3DLibrary;
        if (cancelled || !containerRef.current) return;
        const map = new library.Map3DElement({ center, range: cameraRange, tilt: 62, heading: 0, mode: 'SATELLITE' });
        map.style.width = '100%';
        map.style.height = '100%';
        containerRef.current.replaceChildren(map);
        mapRef.current = map;

        for (const track of result.unitTracks) {
          for (const segment of track.segments) {
            if (segment.keyframes.length < 2) continue;
            map.append(new library.Polyline3DElement({
              path: segment.keyframes.map(frame => ({ lat: frame.position.latitude, lng: frame.position.longitude })),
              strokeColor: '#ffb95f', outerColor: '#121212', strokeWidth: 5, outerWidth: 0.3,
              altitudeMode: 'RELATIVE_TO_GROUND', drawsOccludedSegments: true,
            }));
          }
        }

        for (const graphic of deployment?.tacticalGraphics ?? []) {
          if (graphic.geometry.type === 'Polygon') {
            map.append(new library.Polygon3DElement({
              path: graphic.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng })), fillColor: '#80d8ff33',
              strokeColor: '#80d8ff', strokeWidth: 3, altitudeMode: 'RELATIVE_TO_GROUND', drawsOccludedSegments: true,
            }));
          } else {
            map.append(new library.Polyline3DElement({
              path: graphic.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), strokeColor: '#80d8ff', strokeWidth: 4,
              altitudeMode: 'RELATIVE_TO_GROUND', drawsOccludedSegments: true,
            }));
          }
        }

        for (const objective of deployment?.objectives ?? []) {
          const lng = objective.position.longitude ?? objective.position.lon;
          const lat = objective.position.latitude ?? objective.position.lat;
          if (typeof lng !== 'number' || typeof lat !== 'number') continue;
          map.append(new library.Marker3DInteractiveElement({ position: { lat, lng }, ...markerText(objective.name ? `OBJ · ${objective.name}` : 'OBJ'), sizePreserved: true }));
        }

        const unitById = new Map(units.map(unit => [unit.id, unit]));
        for (const item of positionsAtTime(result, units, clock.current.simulationTime)) {
          const unit = unitById.get(item.unitId);
          if (!unit?.sidc) continue;
          const marker = new library.Marker3DInteractiveElement({
            position: { lat: item.position.latitude, lng: item.position.longitude },
            ...markerText(unit.name), sizePreserved: true, collisionBehavior: 'REQUIRED',
          });
          const template = document.createElement('template');
          template.innerHTML = createMilitarySymbolSvg(unit.sidc, 56);
          marker.append(template);
          marker.addEventListener('gmp-click', () => onSelectUnit(unit.id));
          markersRef.current.set(unit.id, marker);
          map.append(marker);
        }
        setReady(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Google 3D 지도를 초기화하지 못했습니다.');
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [cameraRange, center, clock, deployment, onSelectUnit, result, units]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let previousTime = Number.NaN;
    const tick = () => {
      const time = clock.current.simulationTime;
      if (time !== previousTime) {
        for (const item of positionsAtTime(result, units, time)) {
          const marker = markersRef.current.get(item.unitId);
          if (marker) marker.position = { lat: item.position.latitude, lng: item.position.longitude };
        }
        previousTime = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, ready, result, units]);

  useEffect(() => {
    for (const [unitId, marker] of markersRef.current) {
      marker.zIndex = unitId === runtime.selectedUnitId ? 100 : 1;
    }
  }, [runtime.selectedUnitId]);

  return (
    <section className="relative flex-1 overflow-hidden bg-[#101418]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-6 top-6 z-10 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur">GOOGLE 3D · RESULT PLAYBACK</div>
      {!ready && !error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90 text-sm text-on-surface-variant">Google 3D 지도를 불러오는 중입니다…</div>}
      {error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/95 p-6">
        <div className="max-w-xl rounded border border-error/50 bg-surface-container-high p-6 text-center">
          <p className="font-label-caps text-error">3D MAP UNAVAILABLE</p>
          <p className="mt-2 text-sm text-on-surface">{error}</p>
          <p className="mt-2 text-xs text-on-surface-variant">Google Cloud에서 Maps JavaScript API와 3D Maps를 활성화하고 환경 변수에 브라우저 제한 API 키를 입력해 주세요.</p>
        </div>
      </div>}
    </section>
  );
}
