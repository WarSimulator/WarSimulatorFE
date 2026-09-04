import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TacticalGraphic } from '../../../types';
import { graphicCoordinates, rotateGraphic, rotationCenter, toRotationPlane } from '../lib/rotateGraphic';

type Props = { map: MapLibreMap; graphic: TacticalGraphic;
  onPreview: (graphic: TacticalGraphic) => void; onCommit: (graphic: TacticalGraphic) => void };
export function GraphicRotationHandle({ map, graphic, onPreview, onCommit }: Props) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [degrees, setDegrees] = useState<number | null>(null);
  const drag = useRef<{ base: TacticalGraphic; center: [number, number]; start: number; latest: TacticalGraphic; moved: boolean } | null>(null);
  const panWasEnabled = useRef(false);
  const restorePan = () => { if (panWasEnabled.current) map.dragPan.enable(); panWasEnabled.current = false; };
  useEffect(() => {
    const update = () => {
      if (drag.current) return;
      const points = graphicCoordinates(graphic).map(p => map.project(p));
      const x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2;
      const y = Math.min(...points.map(p => p.y)) - 34;
      setPosition({ x, y: Math.max(20, y) });
    };
    update(); map.on('move', update);
    return () => { map.off('move', update); };
  }, [map, graphic]);
  useEffect(() => () => { restorePan(); }, [map]);
  const angleAt = (event: PointerEvent, center: [number, number]) => {
    const rect = map.getContainer().getBoundingClientRect();
    const point = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    const p = toRotationPlane([point.lng, point.lat], center[0]);
    const c = toRotationPlane(center, center[0]);
    return Math.atan2(p[1] - c[1], p[0] - c[0]);
  };
  if (!position) return null;
  return <button type="button" aria-label="Rotate graphic" title="드래그하여 회전 · 놓으면 완료 · Esc로 취소"
    className="absolute z-30 flex h-8 w-8 touch-none items-center justify-center rounded-full border border-secondary bg-surface text-secondary shadow-lg cursor-grab active:cursor-grabbing"
    style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}
    onDoubleClick={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const center = rotationCenter(graphic);
      drag.current = { base: graphic, center, start: angleAt(event, center), latest: graphic, moved: false };
      panWasEnabled.current = map.dragPan.isEnabled(); map.dragPan.disable();
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current) return;
      event.preventDefault(); event.stopPropagation();
      let angle = angleAt(event, current.center) - current.start;
      if (event.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12;
      current.latest = rotateGraphic(current.base, angle, current.center);
      current.moved = current.moved || Math.abs(angle) > 0.002;
      onPreview(current.latest);
      setDegrees(Math.round(angle * 180 / Math.PI));
      const rect = map.getContainer().getBoundingClientRect();
      setPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }}
    onPointerUp={event => {
      event.preventDefault(); event.stopPropagation();
      const current = drag.current; drag.current = null;
      restorePan(); setDegrees(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (current?.moved) onCommit(current.latest);
    }}
    onPointerCancel={() => {
      const current = drag.current; drag.current = null;
      restorePan(); setDegrees(null);
      if (current) onPreview(current.base);
    }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M20 12a8 8 0 1 0-2.3 5.7" /></svg>
    {degrees !== null && <span className="pointer-events-none absolute left-10 whitespace-nowrap rounded bg-surface px-2 py-1 text-xs">{degrees}°</span>}
  </button>;
}
