import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DeploymentEditorMode,
  DeploymentPaletteItem,
  DeploymentSetup,
  DeploymentUnit,
  TacticalGraphic,
  TacticalGraphicType,
} from '../../../types';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { graphicColor } from '../lib/graphicColor';
import { createGeoPosition, getLngLat } from '../lib/position';
import { removeDeploymentEntity } from '../lib/deploymentEditing';
import { createMilitarySymbolSvg, get3DUnitSymbolSize } from '../lib/symbolSvg';
import { createTaskGraphic, getTacticalTask } from '../lib/tacticalTasks';
import {
  loadGoogleMaps,
  createPhaseLineNodes,
  SURFACE_ALTITUDE_MODE,
  SURFACE_DRAWS_OCCLUDED_SEGMENTS,
  toSurfacePath,
  type Map3DNode,
  type Maps3DLibrary,
  type Marker3DNode,
  type Position3D,
} from './Google3DTacticalMap';

type Props = {
  deployment: DeploymentSetup;
  selectedEntityId?: string;
  mode: DeploymentEditorMode;
  onChange: (deployment: DeploymentSetup) => void;
  onSelectEntity: (entityId?: string) => void;
  onModeChange: (mode: DeploymentEditorMode) => void;
};

type MapClickEvent = Event & { position?: Position3D };

const GRAPHIC_NAMES: Record<TacticalGraphicType, string> = {
  route: 'Route Alpha', axis: 'Axis Alpha', 'phase-line': 'PL RED', boundary: 'Boundary Alpha',
  area: 'Area Alpha', freehand: 'Freehand Alpha', 'mil-task': 'Tactical Task',
};

function nextUnitDesignation(units: DeploymentUnit[], item: Extract<DeploymentPaletteItem, { kind: 'unit' }>) {
  const count = units.filter(unit => unit.affiliation === item.affiliation && unit.unitType === item.unitType).length + 1;
  return `${item.affiliation === 'friendly' ? 'Friendly' : 'Enemy'} ${item.label.split(' / ').at(-1)} ${count}`;
}

function getInitialEditorCenter(deployment: DeploymentSetup): Position3D {
  if (deployment.mapView?.center) {
    return { lng: deployment.mapView.center[0], lat: deployment.mapView.center[1], altitude: 0 };
  }
  const points = [
    ...deployment.units.map(unit => getLngLat(unit.position)),
    ...deployment.objectives.map(objective => getLngLat(objective.position)),
  ];
  if (!points.length) return { lng: DEFAULT_MAP_CENTER[0], lat: DEFAULT_MAP_CENTER[1], altitude: 0 };
  return {
    lng: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    lat: points.reduce((sum, point) => sum + point[1], 0) / points.length,
    altitude: 0,
  };
}

function getEditorCameraRange(deployment: DeploymentSetup, center: Position3D) {
  const graphicPoints = deployment.tacticalGraphics.flatMap(graphic => graphic.geometry.type === 'Polygon'
    ? graphic.geometry.coordinates[0]
    : graphic.geometry.coordinates);
  const points = [
    ...deployment.units.map(unit => getLngLat(unit.position)),
    ...deployment.objectives.map(objective => getLngLat(objective.position)),
    ...graphicPoints,
  ];
  const farthest = points.reduce((maximum, [lng, lat]) => {
    const latitudeMeters = (lat - center.lat) * 111_000;
    const longitudeMeters = (lng - center.lng) * 111_000 * Math.cos(center.lat * Math.PI / 180);
    return Math.max(maximum, Math.hypot(latitudeMeters, longitudeMeters));
  }, 0);
  return Math.max(1_500, Math.min(30_000, farthest * 2.5));
}

function modeText(mode: DeploymentEditorMode) {
  if (mode.type === 'select') return '선택 / 편집';
  if (mode.type === 'place') return mode.item.kind === 'unit' ? `${mode.item.label} 배치` : '목표 배치';
  if (mode.type === 'draw-task') return getTacticalTask(mode.definitionId)?.label ?? '전술 과업';
  if (mode.type === 'append-geometry') return '도형 기준점 추가';
  return `${mode.graphicType.toUpperCase()} 그리기`;
}

function markerText(value?: string) {
  const text = value?.trim();
  return text ? { label: text, title: text } : {};
}

export function Google3DDeploymentMap({ deployment, selectedEntityId, mode, onChange, onSelectEntity, onModeChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DNode | null>(null);
  const libraryRef = useRef<Maps3DLibrary | null>(null);
  const overlaysRef = useRef<HTMLElement[]>([]);
  const deploymentRef = useRef(deployment);
  const modeRef = useRef(mode);
  const selectedRef = useRef(selectedEntityId);
  const drawPointsRef = useRef<[number, number][]>([]);
  const relocateRef = useRef(false);
  const editingVertexRef = useRef<number | undefined>(undefined);
  const [drawPointCount, setDrawPointCount] = useState(0);
  const [relocate, setRelocate] = useState(false);
  const [editingVertex, setEditingVertex] = useState<number | undefined>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const center = useMemo(() => getInitialEditorCenter(deployment), []);
  const cameraRange = useMemo(() => getEditorCameraRange(deployment, center), [center]);

  useEffect(() => { deploymentRef.current = deployment; }, [deployment]);
  useEffect(() => {
    modeRef.current = mode;
    drawPointsRef.current = [];
    editingVertexRef.current = undefined;
    setDrawPointCount(0);
    setRelocate(false);
    setEditingVertex(undefined);
    relocateRef.current = false;
  }, [mode]);
  useEffect(() => { selectedRef.current = selectedEntityId; }, [selectedEntityId]);

  const setRelocation = (value: boolean) => { relocateRef.current = value; setRelocate(value); };

  const selectVertex = (index: number | undefined) => {
    editingVertexRef.current = index;
    setEditingVertex(index);
  };

  const placeAt = (lng: number, lat: number) => {
    const current = deploymentRef.current;
    const currentMode = modeRef.current;
    if (relocateRef.current && selectedRef.current) {
      const id = selectedRef.current;
      onChange({
        ...current,
        units: current.units.map(unit => unit.id === id ? { ...unit, position: createGeoPosition(lng, lat) } : unit),
        objectives: current.objectives.map(item => item.id === id ? { ...item, position: createGeoPosition(lng, lat) } : item),
      });
      setRelocation(false);
      return;
    }
    if (currentMode.type === 'place') {
      const id = `${currentMode.item.kind}-${crypto.randomUUID()}`;
      if (currentMode.item.kind === 'unit') {
        onChange({ ...current, units: [...current.units, {
          id, designation: nextUnitDesignation(current.units, currentMode.item), affiliation: currentMode.item.affiliation,
          unitType: currentMode.item.unitType, echelon: currentMode.item.echelon, sidc: currentMode.item.sidc,
          symbolStandard: currentMode.item.symbolStandard ?? '2525', position: createGeoPosition(lng, lat),
        }] });
      } else {
        onChange({ ...current, objectives: [...current.objectives, { id, name: `Objective ${current.objectives.length + 1}`, position: createGeoPosition(lng, lat) }] });
      }
      onSelectEntity(id);
      onModeChange({ type: 'select' });
      return;
    }
    if (currentMode.type === 'append-geometry') {
      onChange({ ...current, tacticalGraphics: current.tacticalGraphics.map(graphic => {
        if (graphic.id !== currentMode.graphicId) return graphic;
        const vertexIndex = editingVertexRef.current;
        if (vertexIndex !== undefined) {
          if (graphic.geometry.type === 'Polygon') {
            const vertices = graphic.geometry.coordinates[0].slice(0, -1);
            const nextVertices = vertices.map((point, index) => index === vertexIndex ? [lng, lat] as [number, number] : point);
            return { ...graphic, geometry: { type: 'Polygon', coordinates: [[...nextVertices, nextVertices[0]]] } };
          }
          return { ...graphic, geometry: { type: 'LineString', coordinates: graphic.geometry.coordinates.map((point, index) => index === vertexIndex ? [lng, lat] as [number, number] : point) } };
        }
        const task = getTacticalTask(graphic.tacticalSymbol?.definitionId);
        const pointCount = graphic.geometry.type === 'Polygon' ? graphic.geometry.coordinates[0].length - 1 : graphic.geometry.coordinates.length;
        if (task && pointCount >= task.maxPoints) return graphic;
        if (graphic.geometry.type === 'Polygon') {
          const ring = graphic.geometry.coordinates[0];
          return { ...graphic, geometry: { type: 'Polygon', coordinates: [[...ring.slice(0, -1), [lng, lat], ring[0]]] } };
        }
        return { ...graphic, geometry: { type: 'LineString', coordinates: [...graphic.geometry.coordinates, [lng, lat]] } };
      }) });
      if (editingVertexRef.current !== undefined) selectVertex(undefined);
      return;
    }
    if (currentMode.type === 'draw' || currentMode.type === 'draw-task') {
      drawPointsRef.current = [...drawPointsRef.current, [lng, lat]];
      setDrawPointCount(drawPointsRef.current.length);
      if (currentMode.type === 'draw-task') {
        const task = getTacticalTask(currentMode.definitionId);
        if (task && drawPointsRef.current.length === task.maxPoints) finishDrawing();
      }
    }
  };

  const finishDrawing = () => {
    const points = drawPointsRef.current;
    const currentMode = modeRef.current;
    const current = deploymentRef.current;
    let graphic: TacticalGraphic | undefined;
    if (currentMode.type === 'draw-task') {
      const task = getTacticalTask(currentMode.definitionId);
      if (task && points.length >= task.minPoints && points.length <= task.maxPoints) graphic = createTaskGraphic(task, currentMode.affiliation, points);
    } else if (currentMode.type === 'draw' && points.length >= (currentMode.graphicType === 'area' ? 3 : 2)) {
      graphic = {
        id: `graphic-${crypto.randomUUID()}`, type: currentMode.graphicType, name: GRAPHIC_NAMES[currentMode.graphicType],
        geometry: currentMode.graphicType === 'area'
          ? { type: 'Polygon', coordinates: [[...points, points[0]]] }
          : { type: 'LineString', coordinates: points },
      };
    }
    if (!graphic) return;
    onChange({ ...current, tacticalGraphics: [...current.tacticalGraphics, graphic] });
    onSelectEntity(graphic.id);
    onModeChange({ type: 'select' });
  };

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) { setError('VITE_GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.'); return; }
    let cancelled = false;
    const initialize = async () => {
      try {
        const google = await loadGoogleMaps(apiKey);
        const library = await google.maps.importLibrary('maps3d') as Maps3DLibrary;
        if (cancelled || !containerRef.current) return;
        const map = new library.Map3DElement({ center, range: cameraRange, tilt: 58, heading: 0, mode: 'HYBRID' });
        map.style.width = '100%'; map.style.height = '100%';
        map.addEventListener('gmp-click', event => {
          const position = (event as MapClickEvent).position;
          if (!position) return;
          if (relocateRef.current) placeAt(position.lng, position.lat);
          else if (modeRef.current.type === 'select') onSelectEntity(undefined);
          else placeAt(position.lng, position.lat);
        });
        containerRef.current.replaceChildren(map);
        libraryRef.current = library; mapRef.current = map; setReady(true);
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Google 3D 지도를 초기화하지 못했습니다.'); }
    };
    void initialize();
    return () => { cancelled = true; overlaysRef.current = []; mapRef.current?.remove(); mapRef.current = null; libraryRef.current = null; };
  }, [cameraRange, center]);

  useEffect(() => {
    const map = mapRef.current; const library = libraryRef.current;
    if (!ready || !map || !library) return;
    overlaysRef.current.forEach(node => node.remove());
    overlaysRef.current = [];
    const append = (node: HTMLElement) => { overlaysRef.current.push(node); map.append(node); };
    const selectGraphic = (graphicId: string) => (event: Event) => {
      event.stopPropagation();
      selectedRef.current = graphicId;
      onSelectEntity(graphicId);
      onModeChange({ type: 'select' });
    };
    const graphicsInteractive = mode.type === 'select' && !relocate;
    deployment.tacticalGraphics.forEach(graphic => {
      const selected = graphic.id === selectedEntityId;
      const color = graphicColor(graphic);
      if (graphic.type === 'phase-line' && graphic.geometry.type === 'LineString') {
        createPhaseLineNodes(
          library,
          graphic.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
          graphic.name ?? 'Phase Line',
          selected ? 7 : 4,
          { interactive: graphicsInteractive, strokeColor: color },
        ).forEach(node => {
          if (graphicsInteractive) {
            node.style.cursor = 'pointer';
            node.addEventListener('gmp-click', selectGraphic(graphic.id));
          } else {
            node.style.pointerEvents = 'none';
          }
          append(node);
        });
        return;
      }
      const common = {
        strokeColor: color,
        strokeWidth: selected ? 7 : 4,
        altitudeMode: SURFACE_ALTITUDE_MODE,
        drawsOccludedSegments: SURFACE_DRAWS_OCCLUDED_SEGMENTS,
      };
      const PolygonElement = graphicsInteractive ? library.Polygon3DInteractiveElement : library.Polygon3DElement;
      const PolylineElement = graphicsInteractive ? library.Polyline3DInteractiveElement : library.Polyline3DElement;
      const node = graphic.geometry.type === 'Polygon'
        ? new PolygonElement({ ...common, path: toSurfacePath(graphic.geometry.coordinates[0].map(([lng, lat]) => ({ lng, lat }))), fillColor: `${color}${selected ? '55' : '2f'}`, zIndex: selected ? 50 : 1 })
        : new PolylineElement({ ...common, path: toSurfacePath(graphic.geometry.coordinates.map(([lng, lat]) => ({ lng, lat }))), outerColor: '#111827', outerWidth: selected ? 0.55 : 0.35, zIndex: selected ? 50 : 1 });
      if (graphicsInteractive) {
        node.style.cursor = 'pointer';
        node.addEventListener('gmp-click', selectGraphic(graphic.id));
      } else {
        node.style.pointerEvents = 'none';
      }
      append(node);
    });

    if (mode.type === 'append-geometry') {
      const graphic = deployment.tacticalGraphics.find(item => item.id === mode.graphicId);
      if (graphic) {
        const vertices = graphic.geometry.type === 'Polygon'
          ? graphic.geometry.coordinates[0].slice(0, -1)
          : graphic.geometry.coordinates;
        vertices.forEach(([lng, lat], index) => {
          const active = index === editingVertex;
          const marker = new library.Marker3DInteractiveElement({ position: { lng, lat }, sizePreserved: true, zIndex: 200 + index, title: `${index + 1}번 기준점` });
          const template = document.createElement('template');
          template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${active ? 28 : 22}" height="${active ? 28 : 22}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="${active ? '#ffb95f' : '#ffffff'}" stroke="#111827" stroke-width="3"/><text x="12" y="15" text-anchor="middle" font-size="9" font-weight="700" fill="#111827">${index + 1}</text></svg>`;
          marker.append(template);
          marker.style.cursor = 'crosshair';
          marker.addEventListener('gmp-click', event => {
            event.stopPropagation();
            selectVertex(index);
          });
          append(marker);
        });
      }
    }
    deployment.objectives.forEach(objective => {
      const [lng, lat] = getLngLat(objective.position);
      const marker = new library.Marker3DInteractiveElement({ position: { lng, lat }, ...markerText(objective.name ? `OBJ · ${objective.name}` : 'OBJ'), sizePreserved: true, zIndex: objective.id === selectedEntityId ? 100 : 2 });
      if (mode.type === 'select' && !relocate) {
        marker.style.cursor = 'grab';
        marker.addEventListener('gmp-click', event => {
          event.stopPropagation();
          onSelectEntity(objective.id);
          selectedRef.current = objective.id;
          setRelocation(true);
        });
      } else marker.style.pointerEvents = 'none';
      append(marker);
    });
    deployment.units.forEach(unit => {
      const [lng, lat] = getLngLat(unit.position);
      const marker: Marker3DNode = new library.Marker3DInteractiveElement({ position: { lng, lat }, ...markerText(unit.designation), sizePreserved: true, zIndex: unit.id === selectedEntityId ? 100 : 3 });
      const template = document.createElement('template');
      template.innerHTML = createMilitarySymbolSvg(unit.sidc, get3DUnitSymbolSize(unit.symbolScale, unit.id === selectedEntityId), undefined, unit.symbolStandard);
      marker.append(template);
      if (mode.type === 'select' && !relocate) {
        marker.style.cursor = 'grab';
        marker.addEventListener('gmp-click', event => {
          event.stopPropagation();
          onSelectEntity(unit.id);
          selectedRef.current = unit.id;
          setRelocation(true);
        });
      } else marker.style.pointerEvents = 'none';
      append(marker);
    });
  }, [deployment, editingVertex, mode, onModeChange, onSelectEntity, ready, relocate, selectedEntityId]);

  const deleteSelected = () => {
    if (!selectedEntityId) return;
    const nextDeployment = removeDeploymentEntity(deploymentRef.current, selectedEntityId);
    setRelocation(false);
    onSelectEntity(undefined);
    onModeChange({ type: 'select' });
    onChange(nextDeployment);
  };

  const deleteEditingVertex = () => {
    if (mode.type !== 'append-geometry' || editingVertex === undefined) return;
    const current = deploymentRef.current;
    onChange({ ...current, tacticalGraphics: current.tacticalGraphics.map(graphic => {
      if (graphic.id !== mode.graphicId) return graphic;
      const task = getTacticalTask(graphic.tacticalSymbol?.definitionId);
      const minimumPoints = task?.minPoints ?? (graphic.geometry.type === 'Polygon' ? 3 : 2);
      if (graphic.geometry.type === 'Polygon') {
        const vertices = graphic.geometry.coordinates[0].slice(0, -1);
        if (vertices.length <= minimumPoints) return graphic;
        const next = vertices.filter((_, index) => index !== editingVertex);
        return { ...graphic, geometry: { type: 'Polygon', coordinates: [[...next, next[0]]] } };
      }
      if (graphic.geometry.coordinates.length <= minimumPoints) return graphic;
      return { ...graphic, geometry: { type: 'LineString', coordinates: graphic.geometry.coordinates.filter((_, index) => index !== editingVertex) } };
    }) });
    selectVertex(undefined);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (event.key === 'Escape') {
        selectVertex(undefined);
        onSelectEntity(undefined);
        onModeChange({ type: 'select' });
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && mode.type === 'select' && selectedEntityId) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode.type, selectedEntityId]);

  const selectedMovable = deployment.units.some(unit => unit.id === selectedEntityId) || deployment.objectives.some(item => item.id === selectedEntityId);
  const editingGraphic = mode.type === 'append-geometry' ? deployment.tacticalGraphics.find(item => item.id === mode.graphicId) : undefined;
  const editingPointCount = editingGraphic
    ? editingGraphic.geometry.type === 'Polygon' ? editingGraphic.geometry.coordinates[0].length - 1 : editingGraphic.geometry.coordinates.length
    : 0;
  const editingMinimumPoints = editingGraphic
    ? getTacticalTask(editingGraphic.tacticalSymbol?.definitionId)?.minPoints ?? (editingGraphic.geometry.type === 'Polygon' ? 3 : 2)
    : 0;
  const canDeleteEditingVertex = editingVertex !== undefined && editingPointCount > editingMinimumPoints;
  const minimumPoints = mode.type === 'draw' ? (mode.graphicType === 'area' ? 3 : 2) : mode.type === 'draw-task' ? (getTacticalTask(mode.definitionId)?.minPoints ?? Infinity) : Infinity;

  return <section className="relative h-full overflow-hidden bg-[#101418]">
    <div ref={containerRef} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-[var(--map-controls-left)] top-4 z-20 rounded border border-secondary/50 bg-surface/90 px-3 py-2 font-data-mono text-[11px] text-secondary shadow backdrop-blur">GOOGLE 3D EDIT · {modeText(mode)}</div>
    {ready && <div className="absolute bottom-5 left-[var(--map-controls-left)] z-20 flex gap-2">
      {mode.type === 'select' && selectedMovable && <button className={`rounded border px-3 py-2 font-data-mono text-xs shadow ${relocate ? 'border-secondary bg-secondary text-on-secondary' : 'border-outline-variant bg-surface/90 text-on-surface'}`} onClick={() => setRelocation(!relocate)}>{relocate ? '이동할 지도 위치 클릭' : '유닛 위치 이동'}</button>}
      {mode.type === 'select' && selectedEntityId && <button type="button" className="rounded border border-error/60 bg-surface/90 px-3 py-2 font-data-mono text-xs text-error shadow" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); deleteSelected(); }}>선택 항목 삭제</button>}
      {mode.type === 'append-geometry' && <>
        <span className="rounded border border-outline-variant bg-surface/90 px-3 py-2 font-data-mono text-xs text-on-surface">{editingVertex === undefined ? '점을 누르면 이동 · 빈 지도 클릭은 점 추가' : `${editingVertex + 1}번 점 선택 · 새 위치 클릭`}</span>
        <button disabled={!canDeleteEditingVertex} className="rounded border border-error/60 bg-surface/90 px-3 py-2 font-data-mono text-xs text-error shadow disabled:opacity-40" onClick={deleteEditingVertex}>선택 점 삭제</button>
        <button className="rounded bg-secondary px-3 py-2 font-data-mono text-xs text-on-secondary" onClick={() => onModeChange({ type: 'select' })}>편집 완료</button>
      </>}
      {(mode.type === 'draw' || mode.type === 'draw-task') && <>
        <span className="rounded border border-outline-variant bg-surface/90 px-3 py-2 font-data-mono text-xs text-on-surface">기준점 {drawPointCount}개</span>
        <button disabled={drawPointCount < minimumPoints} className="rounded bg-secondary px-3 py-2 font-data-mono text-xs text-on-secondary disabled:opacity-40" onClick={finishDrawing}>그리기 완료</button>
        <button className="rounded border border-outline-variant bg-surface/90 px-3 py-2 font-data-mono text-xs text-on-surface" onClick={() => onModeChange({ type: 'select' })}>취소</button>
      </>}
    </div>}
    {!ready && !error && <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface/90 text-sm text-on-surface-variant">Google 3D 배치 지도를 불러오는 중입니다…</div>}
    {error && <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface/95 p-6"><div className="max-w-xl rounded border border-error/50 bg-surface-container-high p-6 text-center"><p className="font-label-caps text-error">3D MAP UNAVAILABLE</p><p className="mt-2 text-sm text-on-surface">{error}</p><p className="mt-2 text-xs text-on-surface-variant">Maps JavaScript API와 3D Maps를 활성화한 뒤 개발 서버를 다시 시작해 주세요.</p></div></div>}
  </section>;
}
