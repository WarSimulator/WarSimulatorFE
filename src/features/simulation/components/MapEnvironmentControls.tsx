import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DEFAULT_ENVIRONMENT, getMapEnvironment, subscribeMapEnvironment, updateMapEnvironment } from '../lib/mapEnvironment';
import { attachMapEnvironment } from '../lib/mapEnvironmentRenderer';

export function MapEnvironmentControls({ map }: { map: MapLibreMap | null }) {
  const settings = useSyncExternalStore(subscribeMapEnvironment, getMapEnvironment);
  const renderer = useRef<ReturnType<typeof attachMapEnvironment> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!map) return;
    setError('');
    try { renderer.current = attachMapEnvironment(map, getMapEnvironment()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '날씨 효과를 표시할 수 없습니다.'); }
    return () => { renderer.current?.destroy(); renderer.current = null; };
  }, [map]);
  useEffect(() => { renderer.current?.update(settings); }, [settings]);
  const buttonClass = (active: boolean) => `flex-1 rounded border px-2 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary ${active ? 'border-secondary/70 bg-secondary/15 text-secondary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}`;
  return <details className="absolute right-[var(--environment-controls-right,56px)] top-16 z-40 w-[172px] open:w-[220px] max-w-[calc(100%-5rem)] rounded border border-outline-variant bg-surface/95 text-xs text-on-surface shadow-lg backdrop-blur">
    <summary className="cursor-pointer select-none px-3 py-2 font-semibold">환경 설정 · {settings.time === 'day' ? '낮' : '밤'} / {{ clear: '맑음', rain: '비', snow: '눈' }[settings.weather]}</summary>
    <div className="space-y-3 border-t border-outline-variant p-3">
      <fieldset disabled={!map || Boolean(error)} className="space-y-3 disabled:opacity-50">
        <legend className="sr-only">지도 환경</legend>
        <div role="group" aria-label="시간대" className="flex gap-1">
          {(['day', 'night'] as const).map(time => <button key={time} type="button" aria-pressed={settings.time === time} className={buttonClass(settings.time === time)} onClick={() => updateMapEnvironment({ time })}>{time === 'day' ? '낮' : '밤'}</button>)}
        </div>
        <div role="group" aria-label="날씨" className="flex gap-1">
          {(['clear', 'rain', 'snow'] as const).map(weather => <button key={weather} type="button" aria-pressed={settings.weather === weather} className={buttonClass(settings.weather === weather)} onClick={() => updateMapEnvironment({ weather })}>{{ clear: '맑음', rain: '비', snow: '눈' }[weather]}</button>)}
        </div>
        {settings.weather !== 'clear' && <>
          <div><p className="mb-1.5 text-on-surface-variant">{settings.weather === 'snow' ? '강설' : '강우'} 강도</p><div role="group" aria-label="강수 강도" className="flex gap-1">
            {([1, 2, 3] as const).map(intensity => <button key={intensity} type="button" aria-pressed={settings.intensity === intensity} className={buttonClass(settings.intensity === intensity)} onClick={() => updateMapEnvironment({ intensity })}>{['약', '중', '강'][intensity - 1]}</button>)}
          </div></div>
          <label className="block">
            <span className="flex justify-between"><span>{settings.weather === 'snow' ? '적설량' : '물 고임'}</span><span>{settings.weather === 'snow' ? settings.snowCover : settings.waterLevel}%</span></span>
            <input type="range" min="0" max="100" step="5" aria-label={settings.weather === 'snow' ? '적설량' : '물 고임'} value={settings.weather === 'snow' ? settings.snowCover : settings.waterLevel} onChange={event => updateMapEnvironment(settings.weather === 'snow' ? { snowCover: Number(event.target.value) } : { waterLevel: Number(event.target.value) })} className="mt-2 w-full accent-secondary" />
          </label>
          {settings.weather === 'rain' && <p className="text-[10px] leading-relaxed text-on-surface-variant">물 고임은 저지대의 시각 효과입니다.</p>}
        </>}
        <button type="button" className="text-[11px] text-on-surface-variant underline underline-offset-2" onClick={() => updateMapEnvironment(DEFAULT_ENVIRONMENT)}>기본 환경으로 초기화</button>
      </fieldset>
      {!map && <p role="status" className="text-on-surface-variant">지도를 준비하고 있습니다…</p>}
      {error && <p role="alert" className="text-error">{error}</p>}
    </div>
  </details>;
}
