import { createUuid } from '../lib/uuid';
import { useEffect, useMemo, useState } from 'react';
import type { DeploymentSetup, SimulationResultPosition } from '../../../types';
import { getVer0ActionInput, type Ver0TargetType } from '../lib/ver0ActionInputs';
import { getPlannedUnitPosition, graphicAnchor, graphicPoints, suggestedCommandEndpoints, ver0Actions, type Ver0Command } from '../lib/ver0Simulation';

type Props = {
  deployment: DeploymentSetup; selectedUnitId?: string; commands: Ver0Command[];
  onSelectUnit: (unitId: string) => void; onChange: (commands: Ver0Command[]) => void;
  mapPickTarget?: 'from' | 'to';
  pickedMapPoint?: { target: 'from' | 'to'; position: SimulationResultPosition; revision: number };
  onMapPickTargetChange?: (target?: 'from' | 'to') => void;
  onEndpointsChange?: (endpoints?: {
    from: SimulationResultPosition;
    to: SimulationResultPosition;
    kind: 'movement' | 'target';
    targetLabel?: string;
  }) => void;
};

const fieldClass = 'w-full rounded border border-outline-variant bg-surface px-2 py-1.5 font-data-mono text-[11px] text-on-surface outline-none focus:border-secondary';
const targetModeLabels: Record<Ver0TargetType, string> = { point: '지도 위치', unit: '유닛', graphic: 'DRAW/전술과업' };

function PointFields({ label, value, onChange, picking, onPick }: { label: string; value: SimulationResultPosition; onChange: (value: SimulationResultPosition) => void; picking?: boolean; onPick?: () => void }) {
  return <fieldset><legend className="mb-1 w-full font-label-caps text-[10px] text-outline"><span className="flex w-full items-center justify-between gap-2"><span>{label}</span>{onPick && <button type="button" onClick={onPick} className={`rounded border px-2 py-1 text-[9px] font-bold ${picking ? 'border-secondary bg-secondary/15 text-secondary' : 'border-outline-variant text-on-surface-variant hover:border-secondary hover:text-secondary'}`}>{picking ? '지도 클릭 대기…' : '지도에서 선택'}</button>}</span></legend>
    <div className="grid grid-cols-2 gap-2"><input aria-label={`${label} 경도`} className={fieldClass} type="number" step="0.000001" value={value.longitude} onChange={event => onChange({ ...value, longitude: Number(event.target.value) })} /><input aria-label={`${label} 위도`} className={fieldClass} type="number" step="0.000001" value={value.latitude} onChange={event => onChange({ ...value, latitude: Number(event.target.value) })} /></div>
    <div className="mt-1 flex justify-between font-data-mono text-[9px] text-outline"><span>LNG</span><span>LAT</span></div>
  </fieldset>;
}

export function Ver0CommandPanel({ deployment, selectedUnitId, commands, onSelectUnit, onChange, mapPickTarget, pickedMapPoint, onMapPickTargetChange, onEndpointsChange }: Props) {
  const unitId = selectedUnitId && deployment.units.some(unit => unit.id === selectedUnitId) ? selectedUnitId : deployment.units[0]?.id ?? '';
  const unit = deployment.units.find(candidate => candidate.id === unitId);
  const [actionId, setActionId] = useState(ver0Actions[0]?.id ?? 'move');
  const input = useMemo(() => getVer0ActionInput(actionId), [actionId]);
  const [targetType, setTargetType] = useState<Ver0TargetType>(input.targetModes[0]);
  const [targetUnitId, setTargetUnitId] = useState('');
  const [targetGraphicId, setTargetGraphicId] = useState('');
  const [pathGraphicId, setPathGraphicId] = useState('');
  const [parameterValues, setParameterValues] = useState<Record<string, number>>({});
  const [startTime, setStartTime] = useState(0); const [endTime, setEndTime] = useState(30);
  const [from, setFrom] = useState<SimulationResultPosition>({ longitude: 0, latitude: 0 });
  const [to, setTo] = useState<SimulationResultPosition>({ longitude: 0, latitude: 0 });
  const [note, setNote] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const targetUnits = useMemo(() => deployment.units.filter(candidate => candidate.id !== unitId), [deployment.units, unitId]);
  const graphics = deployment.tacticalGraphics;

  useEffect(() => { setTargetType(input.targetModes[0]); setParameterValues(Object.fromEntries(input.numericInputs.map(field => [field.key, field.defaultValue]))); setPathGraphicId(''); setNote(''); setPreviewVisible(false); }, [input, unitId]);
  useEffect(() => {
    if (!unit) return;
    const position = input.movesUnit
      ? getPlannedUnitPosition(deployment, commands, unit.id, startTime)
      : suggestedCommandEndpoints(unit).from;
    setFrom(position);
  }, [commands, deployment, input.movesUnit, startTime, unit]);
  useEffect(() => {
    if (!unit) return;
    setTo(input.movesUnit ? getPlannedUnitPosition(deployment, commands, unit.id, startTime) : suggestedCommandEndpoints(unit).from);
  }, [actionId, deployment, unit]);
  useEffect(() => { if (targetType !== 'unit') return; const id = targetUnits.some(candidate => candidate.id === targetUnitId) ? targetUnitId : targetUnits[0]?.id ?? ''; setTargetUnitId(id); const target = deployment.units.find(candidate => candidate.id === id); if (target) setTo(suggestedCommandEndpoints(target).from); }, [deployment.units, targetType, targetUnitId, targetUnits]);
  useEffect(() => { if (targetType !== 'graphic') return; const id = graphics.some(graphic => graphic.id === targetGraphicId) ? targetGraphicId : graphics[0]?.id ?? ''; setTargetGraphicId(id); const anchor = graphicAnchor(graphics.find(graphic => graphic.id === id)); if (anchor) setTo(anchor); }, [graphics, targetGraphicId, targetType]);
  useEffect(() => { if (!pickedMapPoint) return; if (pickedMapPoint.target === 'from') setFrom(pickedMapPoint.position); else setTo(pickedMapPoint.position); setPreviewVisible(true); }, [pickedMapPoint]);
  const targetValid = targetType === 'point' || (targetType === 'unit' && Boolean(targetUnitId)) || (targetType === 'graphic' && Boolean(targetGraphicId));
  useEffect(() => {
    onEndpointsChange?.(unit && targetValid && (previewVisible || Boolean(mapPickTarget))
      ? { from, to, kind: input.movesUnit ? 'movement' : 'target', targetLabel: input.targetLabel }
      : undefined);
  }, [from, input.movesUnit, input.targetLabel, mapPickTarget, onEndpointsChange, previewVisible, targetValid, to, unit]);

  const textValid = !input.textLabel || Boolean(note.trim());
  const addCommand = () => {
    if (!unit || endTime <= startTime || !targetValid || !textValid) return;
    onChange([...commands, { id: `command-${createUuid()}`, unitId: unit.id, kind: 'action', actionId, startTime, endTime, from, to, targetType,
      ...(targetType === 'unit' ? { targetUnitId } : {}), ...(targetType === 'graphic' ? { targetGraphicId } : {}),
      ...(input.pathAllowed && pathGraphicId ? { pathGraphicId } : {}), parameters: parameterValues, note: note.trim() }]);
    setStartTime(endTime); setEndTime(endTime + 30); if (input.movesUnit) setFrom(to); setNote(''); setPreviewVisible(false);
  };

  const unitCommands = commands.filter(command => command.unitId === unitId).sort((a, b) => a.startTime - b.startTime);
  return <aside className="absolute right-4 top-4 z-30 flex max-h-[calc(100%-32px)] w-[380px] flex-col overflow-hidden rounded border border-outline-variant bg-surface-container/95 shadow-xl backdrop-blur">
    <div className="border-b border-outline-variant bg-surface-container-high p-3"><p className="font-label-caps text-xs text-secondary">ACTION COMMAND ASSIGNMENT</p><p className="mt-1 text-[11px] text-on-surface-variant">DRAW·전술과업은 지도에 표시하고, 유닛 실행은 ACTION과 필수 입력값으로 정의합니다.</p></div>
    <div className="min-h-0 space-y-3 overflow-y-auto p-3">
      <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">실행 유닛</span><select className={fieldClass} value={unitId} onChange={event => onSelectUnit(event.target.value)}>{deployment.units.map(item => <option key={item.id} value={item.id}>{item.designation}</option>)}</select></label>
      <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">ACTION</span><select className={fieldClass} value={actionId} onChange={event => setActionId(event.target.value)}>{ver0Actions.map(action => <option key={action.id} value={action.id}>{action.group} · {action.name} · {action.ko}</option>)}</select></label>
      <div className="rounded border border-secondary/30 bg-secondary/5 p-2 text-[10px] text-on-surface-variant"><strong className="text-secondary">{ver0Actions.find(action => action.id === actionId)?.name}</strong> 실행에 필요한 위치·대상·세부 값을 입력하세요.</div>
      <div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block font-label-caps text-[10px] text-outline">시작 시각 (초)</span><input className={fieldClass} type="number" min="0" value={startTime} onChange={event => setStartTime(Number(event.target.value))} /></label><label><span className="mb-1 block font-label-caps text-[10px] text-outline">종료 시각 (초)</span><input className={fieldClass} type="number" min="0.1" value={endTime} onChange={event => setEndTime(Number(event.target.value))} /></label></div>
      <div className="rounded border border-outline-variant bg-surface/70 p-2"><p className="font-label-caps text-[10px] text-outline">{input.originLabel} · 유닛 위치 자동</p><p className="mt-1 font-data-mono text-[11px] text-on-surface">{from.longitude.toFixed(6)}, {from.latitude.toFixed(6)}</p><p className="mt-1 text-[9px] text-on-surface-variant">배치 위치 또는 이전 이동 ACTION의 종료 위치</p></div>
      {input.targetModes.length > 1 && <fieldset><legend className="mb-1 font-label-caps text-[10px] text-outline">{input.targetLabel} 유형</legend><div className={`grid gap-1 rounded border border-outline-variant p-1 ${input.targetModes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{input.targetModes.map(mode => <button key={mode} type="button" onClick={() => { setTargetType(mode); setPreviewVisible(false); }} className={`rounded px-2 py-1.5 text-[10px] font-bold ${targetType === mode ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant hover:bg-surface-variant'}`}>{targetModeLabels[mode]}</button>)}</div></fieldset>}
      {targetType === 'point' && !pathGraphicId && <PointFields label={input.targetLabel} value={to} onChange={value => { setTo(value); setPreviewVisible(true); }} picking={mapPickTarget === 'to'} onPick={() => { const nextPicking = mapPickTarget !== 'to'; setPreviewVisible(nextPicking); onMapPickTargetChange?.(nextPicking ? 'to' : undefined); }} />}
      {targetType === 'unit' && <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">{input.targetLabel}</span><select className={fieldClass} value={targetUnitId} onChange={event => { setTargetUnitId(event.target.value); setPreviewVisible(true); }}>{!targetUnits.length && <option value="">대상으로 선택할 다른 유닛이 없습니다</option>}{targetUnits.map(item => <option key={item.id} value={item.id}>{item.designation}</option>)}</select></label>}
      {targetType === 'graphic' && <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">{input.targetLabel}</span><select className={fieldClass} value={targetGraphicId} onChange={event => { setTargetGraphicId(event.target.value); setPreviewVisible(true); }}>{!graphics.length && <option value="">먼저 지도에 DRAW/전술과업을 그려주세요</option>}{graphics.map(item => <option key={item.id} value={item.id}>{item.type.toUpperCase()} · {item.name ?? item.id}</option>)}</select></label>}
      {input.pathAllowed && <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">이동/접근 경로 (선택)</span><select className={fieldClass} value={pathGraphicId} onChange={event => { const id = event.target.value; setPathGraphicId(id); setPreviewVisible(Boolean(id)); const end = graphicPoints(graphics.find(item => item.id === id)).at(-1); if (end) setTo(end); }}><option value="">직선 경로</option>{graphics.filter(item => item.geometry.type === 'LineString').map(item => <option key={item.id} value={item.id}>{item.type.toUpperCase()} · {item.name ?? item.id}</option>)}</select>{pathGraphicId && <span className="mt-1 block text-[9px] text-secondary">경로의 마지막 지점을 목적지로 사용합니다.</span>}</label>}
      {!!input.numericInputs.length && <div className="grid grid-cols-2 gap-2">{input.numericInputs.map(field => <label key={field.key}><span className="mb-1 block font-label-caps text-[10px] text-outline">{field.label} ({field.unit})</span><input className={fieldClass} type="number" min={field.min} max={field.max} step={field.step} value={parameterValues[field.key] ?? field.defaultValue} onChange={event => setParameterValues(current => ({ ...current, [field.key]: Number(event.target.value) }))} /></label>)}</div>}
      <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">{input.textLabel ?? '명령 메모 / 의도 (선택)'}</span><textarea className={`${fieldClass} min-h-14 resize-y`} value={note} onChange={event => setNote(event.target.value)} placeholder={input.textLabel ? '필수 입력' : '선택 입력'} /></label>
      <button type="button" disabled={!unit || endTime <= startTime || !targetValid || !textValid} onClick={addCommand} className="w-full rounded bg-secondary px-3 py-2 font-label-caps text-xs font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-40">ACTION 명령 할당</button>
      <section className="space-y-2 border-t border-outline-variant pt-3"><div className="flex items-center justify-between"><h3 className="font-label-caps text-[10px] text-outline">할당된 ACTION</h3><span className="rounded bg-secondary/15 px-2 py-0.5 font-data-mono text-[10px] text-secondary">{unitCommands.length}</span></div>
        {!unitCommands.length && <p className="rounded border border-dashed border-outline-variant p-3 text-center text-[11px] text-on-surface-variant">이 유닛에 할당된 ACTION이 없습니다.</p>}
        {unitCommands.map(command => { const action = ver0Actions.find(candidate => candidate.id === command.actionId); const legacyGraphic = deployment.tacticalGraphics.find(candidate => candidate.id === command.graphicId); const label = command.kind === 'action' ? `${action?.name ?? command.actionId} · ${action?.ko ?? ''}` : `기존 명령 · ${legacyGraphic?.name ?? command.kind}`; return <article key={command.id} className="rounded border border-outline-variant bg-surface p-2"><div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-semibold text-on-surface">{label}</p><p className="mt-0.5 font-data-mono text-[10px] text-secondary">H+{command.startTime} → H+{command.endTime}</p></div><button type="button" aria-label="명령 삭제" onClick={() => onChange(commands.filter(item => item.id !== command.id))} className="text-xs text-error">삭제</button></div>{command.note && <p className="mt-1 truncate text-[10px] text-on-surface-variant">{command.note}</p>}</article>; })}
      </section>
    </div>
  </aside>;
}
