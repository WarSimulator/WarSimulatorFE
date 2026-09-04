import { useEffect, useRef, useState, type RefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { DeploymentEditorMode, DeploymentSetup } from '../../../types';
import { createTaskGraphic, getTacticalTask } from '../lib/tacticalTasks';

type Props = { mapRef: RefObject<maplibregl.Map | null>; ready: boolean; mode: DeploymentEditorMode; deployment: DeploymentSetup;
  onChange: (d: DeploymentSetup) => void; onModeChange: (m: DeploymentEditorMode) => void; onSelectEntity: (id?: string) => void };
export function useTaskDrawing(props: Props) {
  const context = useRef(props); context.current = props;
  const [points, setPoints] = useState<[number, number][]>([]);
  const pointsRef = useRef<[number, number][]>([]);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const activeId = props.mode.type === 'draw-task' ? `${props.mode.definitionId}:${props.mode.affiliation}` : '';
  const task = props.mode.type === 'draw-task' ? getTacticalTask(props.mode.definitionId) : undefined;
  const revision = useRef(0);
  const finish = async () => {
    const current = context.current;
    if (current.mode.type !== 'draw-task' || busy.current) return;
    const definition = getTacticalTask(current.mode.definitionId);
    if (!definition) return;
    const token = revision.current;
    try {
      const graphic = createTaskGraphic(definition, current.mode.affiliation, pointsRef.current);
      busy.current = true; setSaving(true);
      const { renderTacticalGraphic } = await import('../lib/renderTacticalGraphic');
      if (token !== revision.current) return;
      renderTacticalGraphic(graphic, 100000);
      const latest = context.current;
      latest.onChange({ ...latest.deployment, tacticalGraphics: [...latest.deployment.tacticalGraphics, graphic] });
      latest.onSelectEntity(graphic.id);
      latest.onModeChange({ type: 'select' });
    } catch (err) { if (token === revision.current) setError(err instanceof Error ? err.message : String(err)); }
    finally { if (token === revision.current) { busy.current = false; setSaving(false); } }
  };
  const finishRef = useRef(finish); finishRef.current = finish;
  const undo = () => { pointsRef.current = pointsRef.current.slice(0, -1); setPoints(pointsRef.current); setError(''); };
  useEffect(() => {
    revision.current++; busy.current = false; setSaving(false); pointsRef.current = []; setPoints([]); setError('');
    const map = props.mapRef.current;
    if (!activeId || !props.ready || !map) return;
    context.current.onSelectEntity(undefined);
    const wasZoomEnabled = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable(); map.getCanvas().style.cursor = 'crosshair';
    const click = (event: maplibregl.MapMouseEvent) => {
      if (busy.current) return;
      const current = context.current;
      if (current.mode.type !== 'draw-task') return;
      const definition = getTacticalTask(current.mode.definitionId);
      if (!definition || pointsRef.current.length >= definition.maxPoints) return;
      const p: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      if (pointsRef.current.some(v => Math.abs(v[0] - p[0]) + Math.abs(v[1] - p[1]) < 1e-9)) return;
      pointsRef.current = [...pointsRef.current, p]; setPoints(pointsRef.current); setError('');
      if (pointsRef.current.length === definition.maxPoints) void finishRef.current();
    };
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,select,textarea')) return;
      if (event.key === 'Escape') context.current.onModeChange({ type: 'select' });
      if (event.key === 'Enter') { event.preventDefault(); void finishRef.current(); }
      if (event.key === 'Backspace' && !busy.current) { event.preventDefault(); undo(); }
    };
    map.on('click', click); window.addEventListener('keydown', key);
    return () => { revision.current++; map.off('click', click); window.removeEventListener('keydown', key); if (wasZoomEnabled) map.doubleClickZoom.enable(); map.getCanvas().style.cursor = ''; };
  }, [activeId, props.ready, props.mapRef]);
  useEffect(() => {
    const map = props.mapRef.current;
    if (!map || !activeId) return;
    const markers = points.map((point, i) => {
      const element = document.createElement('div');
      element.textContent = String(i + 1);
      element.style.cssText = 'background:#1d4ed8;color:white;border:2px solid white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:20px;pointer-events:none;font-size:12px';
      return new maplibregl.Marker({ element }).setLngLat(point).addTo(map);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [points, props.mapRef, activeId]);
  return { task, count: points.length, finish, undo, error, saving };
}
