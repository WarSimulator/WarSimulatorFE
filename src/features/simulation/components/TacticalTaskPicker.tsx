import { useMemo, useState } from 'react';
import type { DeploymentAffiliation, DeploymentEditorMode } from '../../../types';
import { tacticalTasks, taskLabel, type TacticalTaskDefinition } from '../lib/tacticalTasks';

function TaskPreview({ task }: { task: TacticalTaskDefinition }) {
  const lines = task.preview.flatMap(feature => {
    const g = feature.geometry;
    if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates;
    if (g.type === 'LineString') return [g.coordinates];
    return [];
  });
  const coordinates = [...lines.flat(), ...task.samplePoints];
  const xs = coordinates.map(p => p[0]); const ys = coordinates.map(p => p[1]);
  const minX = Math.min(...xs), maxY = Math.max(...ys);
  const scale = Math.min(170 / (Math.max(...xs) - minX || 1), 95 / (maxY - Math.min(...ys) || 1));
  const x = (v: number) => 15 + (v - minX) * scale;
  const y = (v: number) => 15 + (maxY - v) * scale;
  return <svg viewBox="0 0 200 125" className="w-full rounded bg-slate-100" aria-label={`${task.label} 미리보기 및 기준점 순서`}>
    {lines.map((line, i) => <polyline key={i} points={line.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth="1.5" />)}
    {task.preview.map((f, i) => f.geometry.type === 'Point' && f.properties?.label ? <text key={`t${i}`} x={x(f.geometry.coordinates[0])} y={y(f.geometry.coordinates[1])} fontSize="9" textAnchor="middle">{f.properties.label}</text> : null)}
    {task.samplePoints.map((p, i) => <g key={i}><circle cx={x(p[0])} cy={y(p[1])} r="7" fill="#1d4ed8" /><text x={x(p[0])} y={y(p[1]) + 3} fill="white" fontSize="9" textAnchor="middle">{i + 1}</text></g>)}
  </svg>;
}
export function TacticalTaskPicker({ mode, onModeChange, affiliation }: {
  mode: DeploymentEditorMode; onModeChange: (mode: DeploymentEditorMode) => void; affiliation: DeploymentAffiliation;
}) {
  const [standard, setStandard] = useState('2525E');
  const [query, setQuery] = useState('');
  const tasks = useMemo(() => tacticalTasks.filter(t => t.standard === standard && taskLabel(t).toLowerCase().includes(query.toLowerCase())), [standard, query]);
  const [id, setId] = useState('2525E:340100');
  const task = tasks.find(t => t.id === id) ?? tasks[0];
  const input = 'w-full rounded border border-outline-variant bg-surface px-2 py-2 text-[11px] text-on-surface';
  return <div className="space-y-2 border-t border-outline-variant pt-3">
    <h4 className="font-label-caps text-[11px] text-secondary">Tactical Tasks (전술 과업)</h4>
    <select aria-label="Tactical task standard" className={input} value={standard} onChange={e => { setStandard(e.target.value); if (mode.type === 'draw-task') onModeChange({ type: 'select' }); }}>
      <option value="2525E">MIL-STD-2525E</option><option value="APP6D">NATO APP-6D</option>
    </select>
    <input aria-label="Search tactical tasks" placeholder="과업 검색 / Search tasks" className={input} value={query} onChange={e => { setQuery(e.target.value); if (mode.type === 'draw-task') onModeChange({ type: 'select' }); }} />
    <select aria-label="Tactical task" className={input} value={task?.id ?? ''} onChange={e => { setId(e.target.value); if (mode.type === 'draw-task') onModeChange({ type: 'select' }); }} disabled={!tasks.length}>
      {!tasks.length && <option value="">검색 결과 없음</option>}
      {tasks.map(t => <option key={t.id} value={t.id}>{taskLabel(t)}</option>)}
    </select>
    {task && <>
      <TaskPreview task={task} />
      <p className="text-[11px] leading-relaxed text-on-surface-variant">{taskLabel(task)}<br />번호 순서대로 기준점 {task.minPoints === task.maxPoints ? `${task.minPoints}개` : `${task.minPoints}–${task.maxPoints}개`}를 찍으세요.{task.maxPoints > 4 && ' 마지막 점은 화살표 폭을 정합니다.'}</p>
      <button className={`${input} border-secondary text-secondary hover:bg-secondary/10`} aria-pressed={mode.type === 'draw-task' && mode.definitionId === task.id} onClick={() => onModeChange({ type: 'draw-task', definitionId: task.id, affiliation })}>Draw task (전술 도형 그리기)</button>
    </>}
  </div>;
}
