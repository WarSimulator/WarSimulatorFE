import { useMemo } from 'react';
import { createActionFrame } from '@atlas/atomic-actions';
import type { AtomicActionEffect, DeploymentSetup, SimulationResult } from '../../../types';

type Props = {
  result: SimulationResult;
  deployment?: DeploymentSetup;
  simulationTime: number;
  selectedUnitId: string;
  onSelectUnit: (unitId: string) => void;
};

function effectReference(effect: AtomicActionEffect, deployment?: DeploymentSetup) {
  const reference = effect.parameters.target ?? effect.parameters.destination ?? effect.parameters.recipient;
  if (typeof reference !== 'string' || !reference.trim()) return undefined;
  return deployment?.units.find(unit => unit.id === reference)?.designation
    ?? deployment?.objectives.find(objective => objective.id === reference)?.name
    ?? deployment?.tacticalGraphics.find(graphic => graphic.id === reference)?.name
    ?? reference;
}

function frameForEffect(effect: AtomicActionEffect, simulationTime: number) {
  const progress = Math.max(0, Math.min(1, (simulationTime - effect.startTime) / Math.max(.001, effect.endTime - effect.startTime)));
  const parameters = Object.fromEntries(Object.entries(effect.parameters).flatMap(([key, value]) =>
    typeof value === 'number' && Number.isFinite(value) ? [[key, value]] : [],
  ));
  return createActionFrame({
    action: effect.action === 'Destroy' ? 'Fight' : effect.visualizationId,
    progress,
    parameters,
    data: effect.renderData,
    background: false,
  });
}

export function AtomicActionPlaybackOverlay({ result, deployment, simulationTime, selectedUnitId, onSelectUnit }: Props) {
  const activeEffects = useMemo(() => (result.actionEffects ?? [])
    .filter(effect => effect.startTime <= simulationTime && simulationTime < effect.endTime)
    .sort((first, second) => first.actionSequence - second.actionSequence), [result, simulationTime]);
  const active = activeEffects.find(effect => effect.unitId === selectedUnitId) ?? activeEffects[0];
  const frame = active ? frameForEffect(active, simulationTime) : null;
  if (!active || !frame) return null;
  const reference = effectReference(active, deployment);

  return <>
    <div className="absolute right-4 top-4 z-20 flex max-w-[min(72vw,780px)] gap-1.5 overflow-x-auto rounded bg-surface/65 p-1.5 backdrop-blur">
      {activeEffects.map(effect => <button key={effect.actionSequence} type="button" onClick={() => onSelectUnit(effect.unitId)} title={`${effect.actor} · ${effect.action}${effectReference(effect, deployment) ? ` → ${effectReference(effect, deployment)}` : ''}`} className={`shrink-0 max-w-[180px] truncate rounded border px-2 py-1 font-data-mono text-[10px] ${effect.actionSequence === active.actionSequence ? 'border-primary bg-primary/20 text-primary' : 'border-outline-variant bg-surface/80 text-on-surface-variant'}`}>
        {effect.actor} · {effect.action}
      </button>)}
    </div>
    <section className="pointer-events-none absolute bottom-4 right-4 z-20 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-primary/50 bg-[#111e26]/95 p-3 text-on-surface shadow-xl backdrop-blur" aria-label="선택 행동 시각화">
      <div className="flex items-center justify-between gap-2 font-data-mono text-[11px] text-primary">
        <strong className="truncate">{active.actor} · {active.action}</strong>
        <span>{Math.round(frame.progress * 100)}%</span>
      </div>
      {reference && <p className="mt-1 truncate text-[11px] text-on-surface-variant" title={reference}>대상 · {reference}</p>}
      <svg viewBox="0 0 1000 650" role="img" aria-label={`${active.action}: ${frame.title}`} className="mt-2 block w-full [&_text]:fill-slate-200 [&_text]:text-[18px]" dangerouslySetInnerHTML={{ __html: frame.svg }} />
      <div className="mt-1 text-xs text-primary">{frame.phase + 1}/4 · {frame.title}</div>
      <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{frame.description}</p>
      {active.action === 'Destroy' && <p className="mt-1 text-[10px] text-on-surface-variant">Destroy는 Fight 시각화로 표시</p>}
    </section>
  </>;
}
