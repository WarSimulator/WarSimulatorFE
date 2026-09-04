import { useEffect, useState, type RefObject } from 'react';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { TacticalGraphic } from '../../../types';
export const TASK_SOURCE_ID = 'deployment-tactical-tasks';
export function useTacticalTaskLayer(mapRef: RefObject<MapLibreMap | null>, ready: boolean, graphics: TacticalGraphic[]) {
  const [error, setError] = useState('');
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let cancelled = false;
    let revision = 0;
    const render = async () => {
      const current = ++revision;
      const tasks = graphics.filter(g => g.type === 'mil-task');
      const features: GeoJSON.Feature[] = [];
      const errors: string[] = [];
      if (tasks.length) {
        try {
          const { renderTacticalGraphic } = await import('../lib/renderTacticalGraphic');
          if (cancelled || current !== revision) return;
          const scale = (40075016.686 / 512) * (96 / 0.0254) * Math.cos(map.getCenter().lat * Math.PI / 180) / 2 ** map.getZoom();
          for (const task of tasks) {
            try { features.push(...renderTacticalGraphic(task, scale)); }
            catch (err) { errors.push(`${task.name}: ${err instanceof Error ? err.message : String(err)}`); }
          }
        } catch (err) { errors.push(`전술 도형 모듈을 불러오지 못했습니다: ${String(err)}`); }
      }
      if (cancelled || current !== revision) return;
      (map.getSource(TASK_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
      setError(errors.join(' '));
    };
    void render();
    map.on('zoomend', render);
    return () => { cancelled = true; map.off('zoomend', render); };
  }, [mapRef, ready, graphics]);
  return error;
}
