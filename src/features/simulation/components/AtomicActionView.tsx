import { useEffect, useMemo, useState } from 'react';
import { actions, createActionFrame } from '@atlas/atomic-actions';
import type { SimulationResult } from '../../../types';

type Props = { result?: SimulationResult; simulationTime?: number; unitId?: string };
export function AtomicActionView({ result, simulationTime = 0, unitId }: Props) {
  const [choice, setChoice] = useState(result ? 'auto' : 'observe');
  const [previewProgress, setPreviewProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const automatic = choice === 'auto';
  // The preview owns a clock only outside playback; real playback always uses its parent's time.
  useEffect(() => {
    if (result || !playing) return;
    let handle = 0; let previous: number | undefined;
    const tick = (now: number) => { const dt = previous === undefined ? 0 : Math.min(now - previous, 100); previous = now; setPreviewProgress(p => (p + dt / 16000) % 1); handle = requestAnimationFrame(tick); };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [result, playing]);
  const active = useMemo(() => {
    if (!result) return undefined;
    const effect = result.actionEffects?.find(e => e.unitId === unitId && e.startTime <= simulationTime && simulationTime < e.endTime);
    if (effect) return effect;
    const track = result.unitTracks.find(t => t.unitId === unitId);
    if (!track) return undefined;
    const observation = result.observationEffects?.find(e => e.actor === track.actor && e.startTime <= simulationTime && simulationTime < e.endTime);
    if (observation) return { action: observation.action, startTime: observation.startTime, endTime: observation.endTime, renderData: { observation } };
    const segment = track.segments.find(s => s.startTime <= simulationTime && simulationTime < s.endTime);
    return segment ? { ...segment, renderData: { movement: segment } } : undefined;
  }, [result, simulationTime, unitId]);
  const progress = result ? automatic && active
    ? (simulationTime - active.startTime) / Math.max(.001, active.endTime - active.startTime)
    : (simulationTime - result.startTime) / Math.max(.001, result.endTime - result.startTime)
    : previewProgress;
  const frame = createActionFrame({ action: automatic ? active?.action ?? '' : choice, progress, parameters, data: automatic ? active?.renderData : undefined });
  return <section className="rounded border border-outline-variant bg-surface-container-low p-4 text-on-surface">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-base font-semibold">Atomic Action</h3>
      <select aria-label="시각화할 행동" value={choice} onChange={e => { setChoice(e.target.value); setParameters({}); setPreviewProgress(0); }} className="max-w-full rounded border border-outline-variant bg-surface p-2 text-sm">
        {result && <option value="auto">현재 선택 부대 · 결과 연동</option>}
        {actions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.ko}</option>)}
      </select>
    </div>
    <p className="my-3 text-sm text-on-surface-variant">{automatic && (active?.renderData?.movement || active?.renderData?.observation) ? '실제 결과 데이터 · 화면에 맞춘 축척' : automatic ? '선택 부대의 행동과 재생 시간에 연동한 개념 장면' : '28개 행동 예시 미리보기'} · 결과 판정 아님{result && !automatic ? ' · 하단 타임라인으로 재생' : ''}</p>
    {frame ? <>
      <svg viewBox="0 0 1000 650" role="img" aria-label={`${frame.definition.name}: ${frame.title}`} className="w-full rounded [&_text]:fill-slate-200 [&_text]:text-[16px]" dangerouslySetInnerHTML={{ __html: frame.svg }} />
      <h4 className="mt-3 text-base text-primary">{frame.phase + 1}/4 · {frame.title}</h4>
      <p className="mt-1 text-sm text-on-surface-variant">{frame.description}</p>
      {!automatic && <div className="mt-3 space-y-2">{frame.definition.params.filter(p => p[0] !== 'duration').map(([key, label, min, max, value, suffix]) => <label key={key} className="flex items-center gap-2 text-sm"><span className="w-24">{label}</span><input className="min-w-0 flex-1 accent-orange-300" type="range" min={min} max={max} value={parameters[key] ?? value} onChange={e => setParameters(p => ({ ...p, [key]: Number(e.target.value) }))} /><span className="w-14 text-right">{parameters[key] ?? value}{suffix}</span></label>)}</div>}
    </> : <p className="py-10 text-sm text-on-surface-variant">이 시점에 선택 부대의 지원되는 행동 데이터가 없습니다.</p>}
    {!result && <div className="mt-4 flex items-center gap-3"><button className="rounded bg-primary px-3 py-2 text-on-primary" onClick={() => setPlaying(p => !p)}>{playing ? '일시정지' : '재생'}</button><input aria-label="행동 진행률" className="min-w-0 flex-1" type="range" min="0" max="1000" value={Math.round(previewProgress * 1000)} onChange={e => { setPlaying(false); setPreviewProgress(Number(e.target.value) / 1000); }} /><span className="text-sm">{Math.round(previewProgress * 100)}%</span></div>}
  </section>;
}
