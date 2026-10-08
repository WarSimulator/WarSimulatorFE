import { createUuid } from '../lib/uuid';
import { useEffect, useMemo, useState } from 'react';
import type { DeploymentSetup, SimulationResultPosition } from '../../../types';
import { getTacticalTask, taskLabel } from '../lib/tacticalTasks';
import { suggestedCommandEndpoints, ver0Actions, type Ver0Command, type Ver0CommandKind } from '../lib/ver0Simulation';

type Props = {
  deployment: DeploymentSetup;
  selectedUnitId?: string;
  commands: Ver0Command[];
  onSelectUnit: (unitId: string) => void;
  onChange: (commands: Ver0Command[]) => void;
  mapPickTarget?: 'from' | 'to';
  pickedMapPoint?: { target: 'from' | 'to'; position: SimulationResultPosition; revision: number };
  onMapPickTargetChange?: (target?: 'from' | 'to') => void;
  onEndpointsChange?: (endpoints: { from: SimulationResultPosition; to: SimulationResultPosition }) => void;
};

const fieldClass = 'w-full rounded border border-outline-variant bg-surface px-2 py-1.5 font-data-mono text-[11px] text-on-surface outline-none focus:border-secondary';

function PointFields({ label, value, onChange, picking, onPick }: {
  label: string;
  value: SimulationResultPosition;
  onChange: (value: SimulationResultPosition) => void;
  picking?: boolean;
  onPick?: () => void;
}) {
  return <fieldset>
    <legend className="mb-1 w-full font-label-caps text-[10px] text-outline">
      <span className="flex w-full items-center justify-between gap-2">
        <span>{label}</span>
        {onPick && <button type="button" onClick={onPick} className={`rounded border px-2 py-1 text-[9px] font-bold ${picking ? 'border-secondary bg-secondary/15 text-secondary' : 'border-outline-variant text-on-surface-variant hover:border-secondary hover:text-secondary'}`}>
          {picking ? '지도 클릭 대기…' : '지도에서 선택'}
        </button>}
      </span>
    </legend>
    <div className="grid grid-cols-2 gap-2">
      <input aria-label={`${label} 경도`} className={fieldClass} type="number" step="0.000001" value={value.longitude} onChange={event => onChange({ ...value, longitude: Number(event.target.value) })} />
      <input aria-label={`${label} 위도`} className={fieldClass} type="number" step="0.000001" value={value.latitude} onChange={event => onChange({ ...value, latitude: Number(event.target.value) })} />
    </div>
    <div className="mt-1 flex justify-between font-data-mono text-[9px] text-outline"><span>LNG</span><span>LAT</span></div>
  </fieldset>;
}

export function Ver0CommandPanel({
  deployment, selectedUnitId, commands, onSelectUnit, onChange,
  mapPickTarget, pickedMapPoint, onMapPickTargetChange, onEndpointsChange,
}: Props) {
  const unitId = selectedUnitId && deployment.units.some(unit => unit.id === selectedUnitId) ? selectedUnitId : deployment.units[0]?.id ?? '';
  const unit = deployment.units.find(candidate => candidate.id === unitId);
  const [kind, setKind] = useState<Ver0CommandKind>('draw');
  const matchingGraphics = useMemo(() => deployment.tacticalGraphics.filter(graphic => kind === 'tactical-task' ? graphic.type === 'mil-task' : graphic.type !== 'mil-task'), [deployment.tacticalGraphics, kind]);
  const [graphicId, setGraphicId] = useState('');
  const [actionId, setActionId] = useState(ver0Actions[0]?.id ?? 'move');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);
  const [from, setFrom] = useState<SimulationResultPosition>({ longitude: 0, latitude: 0 });
  const [to, setTo] = useState<SimulationResultPosition>({ longitude: 0, latitude: 0 });
  const [note, setNote] = useState('');
  const graphic = deployment.tacticalGraphics.find(candidate => candidate.id === graphicId);

  useEffect(() => {
    const first = matchingGraphics[0]?.id ?? '';
    if (!matchingGraphics.some(candidate => candidate.id === graphicId)) setGraphicId(first);
  }, [graphicId, matchingGraphics]);
  useEffect(() => {
    if (!unit) return;
    const points = suggestedCommandEndpoints(unit, graphic);
    setFrom(points.from); setTo(points.to);
  }, [graphic, unit]);
  useEffect(() => {
    if (!pickedMapPoint) return;
    if (pickedMapPoint.target === 'from') setFrom(pickedMapPoint.position);
    else setTo(pickedMapPoint.position);
  }, [pickedMapPoint]);
  useEffect(() => {
    onEndpointsChange?.({ from, to });
  }, [from, onEndpointsChange, to]);

  const addCommand = () => {
    if (!unit || endTime <= startTime || (kind !== 'action' && !graphic)) return;
    onChange([...commands, {
      id: `command-${createUuid()}`, unitId: unit.id, kind,
      ...(kind === 'action' ? { actionId } : { graphicId: graphic!.id }),
      startTime, endTime, from, to, note: note.trim(),
    }]);
    setStartTime(endTime); setEndTime(endTime + 30); setNote('');
  };

  const unitCommands = commands.filter(command => command.unitId === unitId).sort((a, b) => a.startTime - b.startTime);
  return <aside className="absolute right-4 top-4 z-30 flex max-h-[calc(100%-32px)] w-[360px] flex-col overflow-hidden rounded border border-outline-variant bg-surface-container/95 shadow-xl backdrop-blur">
    <div className="border-b border-outline-variant bg-surface-container-high p-3">
      <p className="font-label-caps text-xs text-secondary">COMMAND ASSIGNMENT</p>
      <p className="mt-1 text-[11px] text-on-surface-variant">유닛을 선택하고 DRAW·전술과업·ACTION의 시간과 위치를 지정하세요.</p>
    </div>
    <div className="min-h-0 space-y-3 overflow-y-auto p-3">
      <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">실행 유닛</span>
        <select className={fieldClass} value={unitId} onChange={event => onSelectUnit(event.target.value)}>
          {deployment.units.map(item => <option key={item.id} value={item.id}>{item.designation}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-1 rounded border border-outline-variant p-1">
        {([['draw', 'DRAW'], ['tactical-task', '전술과업'], ['action', 'ACTION']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded px-2 py-1.5 text-[10px] font-bold ${kind === value ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant hover:bg-surface-variant'}`}>{label}</button>)}
      </div>
      {kind === 'action' ? <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">ACTION</span>
        <select className={fieldClass} value={actionId} onChange={event => setActionId(event.target.value)}>{ver0Actions.map(action => <option key={action.id} value={action.id}>{action.name} · {action.ko}</option>)}</select>
      </label> : <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">{kind === 'draw' ? 'DRAW 도형' : '전술과업 도형'}</span>
        <select className={fieldClass} value={graphicId} onChange={event => setGraphicId(event.target.value)}>
          {!matchingGraphics.length && <option value="">먼저 지도에 도형을 그려주세요</option>}
          {matchingGraphics.map(item => {
            const task = getTacticalTask(item.tacticalSymbol?.definitionId);
            return <option key={item.id} value={item.id}>{item.type === 'mil-task' && task ? taskLabel(task) : `${item.type.toUpperCase()} · ${item.name ?? item.id}`}</option>;
          })}
        </select>
      </label>}
      <div className="grid grid-cols-2 gap-2">
        <label><span className="mb-1 block font-label-caps text-[10px] text-outline">시작 시각 (초)</span><input className={fieldClass} type="number" min="0" value={startTime} onChange={event => setStartTime(Number(event.target.value))} /></label>
        <label><span className="mb-1 block font-label-caps text-[10px] text-outline">종료 시각 (초)</span><input className={fieldClass} type="number" min="0.1" value={endTime} onChange={event => setEndTime(Number(event.target.value))} /></label>
      </div>
      <PointFields label="어디서 (FROM)" value={from} onChange={setFrom} picking={mapPickTarget === 'from'} onPick={() => onMapPickTargetChange?.(mapPickTarget === 'from' ? undefined : 'from')} />
      <PointFields label="어디로 (TO)" value={to} onChange={setTo} picking={mapPickTarget === 'to'} onPick={() => onMapPickTargetChange?.(mapPickTarget === 'to' ? undefined : 'to')} />
      <label className="block"><span className="mb-1 block font-label-caps text-[10px] text-outline">명령 메모 / 의도</span><textarea className={`${fieldClass} min-h-14 resize-y`} value={note} onChange={event => setNote(event.target.value)} placeholder="예: H+30에 PL RED 통과 후 목표 지역 점령" /></label>
      <button type="button" disabled={!unit || endTime <= startTime || (kind !== 'action' && !graphic)} onClick={addCommand} className="w-full rounded bg-secondary px-3 py-2 font-label-caps text-xs font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-40">명령 할당</button>
      <section className="space-y-2 border-t border-outline-variant pt-3">
        <div className="flex items-center justify-between"><h3 className="font-label-caps text-[10px] text-outline">할당된 명령</h3><span className="rounded bg-secondary/15 px-2 py-0.5 font-data-mono text-[10px] text-secondary">{unitCommands.length}</span></div>
        {!unitCommands.length && <p className="rounded border border-dashed border-outline-variant p-3 text-center text-[11px] text-on-surface-variant">이 유닛에 할당된 명령이 없습니다.</p>}
        {unitCommands.map(command => {
          const item = deployment.tacticalGraphics.find(candidate => candidate.id === command.graphicId);
          const action = ver0Actions.find(candidate => candidate.id === command.actionId);
          const label = command.kind === 'action' ? `${action?.name ?? command.actionId} · ${action?.ko ?? ''}` : item?.name ?? item?.type ?? '도형';
          return <article key={command.id} className="rounded border border-outline-variant bg-surface p-2">
            <div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-semibold text-on-surface">{label}</p><p className="mt-0.5 font-data-mono text-[10px] text-secondary">H+{command.startTime} → H+{command.endTime}</p></div><button type="button" aria-label="명령 삭제" onClick={() => onChange(commands.filter(item => item.id !== command.id))} className="text-xs text-error">삭제</button></div>
            {command.note && <p className="mt-1 truncate text-[10px] text-on-surface-variant">{command.note}</p>}
          </article>;
        })}
      </section>
    </div>
  </aside>;
}
