import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, createActionFrame } from '@atlas/atomic-actions';
import { getAllDeployments } from '../lib/deploymentStorage';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';
import { loadGoogleMaps, type Map3DNode, type Maps3DLibrary } from './Google3DTacticalMap';

function previewCenter() {
  const deployment = [...getAllDeployments()].sort((first, second) => (second.updatedAt ?? '').localeCompare(first.updatedAt ?? ''))[0];
  const [lng, lat] = deployment?.mapView?.center ?? DEFAULT_MAP_CENTER;
  return { lat, lng, altitude: 0 };
}

export function Google3DAtomicActionView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DNode | null>(null);
  const [choice, setChoice] = useState('observe');
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const center = useMemo(previewCenter, []);
  const frame = useMemo(
    () => createActionFrame({ action: choice, progress, parameters, background: false }),
    [choice, parameters, progress],
  );

  useEffect(() => {
    if (!playing) return;
    let animationFrame = 0;
    let previous: number | undefined;
    const tick = (now: number) => {
      const elapsed = previous === undefined ? 0 : Math.min(100, now - previous);
      previous = now;
      setProgress(value => (value + elapsed / 12_000) % 1);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
      if (!apiKey) {
        setError('VITE_GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.');
        return;
      }
      try {
        const google = await loadGoogleMaps(apiKey);
        const library = await google.maps.importLibrary('maps3d') as Maps3DLibrary;
        if (cancelled || !containerRef.current) return;
        const map = new library.Map3DElement({ center, range: 3_500, tilt: 64, heading: -18, mode: 'HYBRID' });
        map.style.width = '100%';
        map.style.height = '100%';
        containerRef.current.replaceChildren(map);

        mapRef.current = map;
        setReady(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Google 3D 액션 지도를 초기화하지 못했습니다.');
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center]);

  return <section className="overflow-hidden rounded border border-outline-variant bg-surface-container-low text-on-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant p-4">
      <div>
        <h3 className="text-base font-semibold">Google 3D Action Overlay</h3>
        <p className="mt-1 text-xs text-on-surface-variant">기존 28개 디자인의 배경을 실제 3D 지형으로 교체한 미리보기</p>
      </div>
      <select aria-label="3D 시각화할 행동" value={choice} onChange={event => { setChoice(event.target.value); setParameters({}); setProgress(0); }} className="max-w-full rounded border border-outline-variant bg-surface p-2 text-sm">
        {actions.map(action => <option key={action.id} value={action.id}>{action.name} · {action.ko}</option>)}
      </select>
    </div>

    <div className="relative h-[min(68vh,720px)] min-h-[480px] bg-[#101418]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur">GOOGLE 3D · ATOMIC ACTION PREVIEW</div>
      {ready && frame && <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-10 pb-16 pt-12">
        <svg viewBox="0 0 1000 650" role="img" aria-label={`${frame.definition.name}: ${frame.title}`} className="w-full max-w-[760px] overflow-visible drop-shadow-[0_10px_10px_rgba(0,0,0,0.9)] [&_text]:font-semibold" dangerouslySetInnerHTML={{ __html: frame.svg }} />
      </div>}
      {!ready && !error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90 text-sm text-on-surface-variant">Google 3D 지도를 불러오는 중입니다…</div>}
      {error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/95 p-6 text-center text-sm text-error">{error}</div>}
      {frame && <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 rounded border border-outline-variant bg-surface/90 p-3 backdrop-blur md:right-auto md:max-w-lg">
        <p className="font-data-mono text-xs text-secondary">{frame.definition.name.toUpperCase()} · {Math.round(progress * 100)}%</p>
        <p className="mt-1 text-sm font-semibold text-primary">{frame.phase + 1}/4 · {frame.title}</p>
        <p className="mt-1 text-xs text-on-surface-variant">{frame.description}</p>
      </div>}
    </div>

    <div className="space-y-3 border-t border-outline-variant p-4">
      {frame && <div className="grid gap-2 sm:grid-cols-4">{frame.definition.phases.map((phase, index) => <button key={phase} type="button" onClick={() => { setPlaying(false); setProgress(index / 4 + 0.02); }} className={`rounded border px-2 py-2 text-left text-xs ${index === frame.phase ? 'border-primary bg-primary/15 text-primary' : 'border-outline-variant text-on-surface-variant'}`}><span className="mr-1 font-data-mono">{index + 1}</span>{phase}</button>)}</div>}
      <div className="flex items-center gap-3">
        <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-on-primary" onClick={() => setPlaying(value => !value)}>{playing ? '일시정지' : '재생'}</button>
        <input aria-label="3D 행동 진행률" className="min-w-0 flex-1 accent-orange-300" type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={event => { setPlaying(false); setProgress(Number(event.target.value) / 1000); }} />
        <span className="w-12 text-right font-data-mono text-xs">{Math.round(progress * 100)}%</span>
      </div>
      {frame && <div className="space-y-2">{frame.definition.params.filter(parameter => parameter[0] !== 'duration').map(([key, label, min, max, value, suffix]) => <label key={key} className="flex items-center gap-2 text-sm"><span className="w-24">{label}</span><input className="min-w-0 flex-1 accent-orange-300" type="range" min={min} max={max} value={parameters[key] ?? value} onChange={event => setParameters(current => ({ ...current, [key]: Number(event.target.value) }))} /><span className="w-14 text-right">{parameters[key] ?? value}{suffix}</span></label>)}</div>}
    </div>
  </section>;
}
