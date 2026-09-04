import { useMemo } from 'react';
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
  return <svg viewBox="0 0 200 125" className="w-full rounded bg-slate-100" role="img" aria-label={`${task.label} 미리보기 및 기준점 순서`}>
    {lines.map((line, i) => <polyline key={i} points={line.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth="1.5" />)}
    {task.preview.map((f, i) => f.geometry.type === 'Point' && f.properties?.label ? <text key={`t${i}`} x={x(f.geometry.coordinates[0])} y={y(f.geometry.coordinates[1])} fontSize="9" textAnchor="middle">{f.properties.label}</text> : null)}
    {task.samplePoints.map((p, i) => <g key={i}><circle cx={x(p[0])} cy={y(p[1])} r="7" fill="#1d4ed8" /><text x={x(p[0])} y={y(p[1]) + 3} fill="white" fontSize="9" textAnchor="middle">{i + 1}</text></g>)}
  </svg>;
}
export function TacticalTaskPicker({ mode, onModeChange, affiliation, standard, query }: {
  mode: DeploymentEditorMode; onModeChange: (mode: DeploymentEditorMode) => void; affiliation: DeploymentAffiliation;
  standard: string; query: string;
}) {
  const tasks = useMemo(() => tacticalTasks.filter(t => (standard === 'all' || t.standard === standard) && taskLabel(t).toLowerCase().includes(query.trim().toLowerCase())), [standard, query]);
  return <section className="space-y-3">
    <h3 className="font-label-caps text-xs text-secondary">전술 과업 · {tasks.length}개</h3>
    <p className="text-xs text-on-surface-variant">카드를 선택한 뒤, 미리보기의 번호 순서대로 지도에 기준점을 찍으세요.</p>
    {!tasks.length && <p className="text-sm text-on-surface-variant">일치하는 전술 과업이 없습니다.</p>}
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
      {tasks.map(task => <button key={task.id} type="button"
        title={task.maxPoints > 4 ? "번호 순서대로 기준점을 찍으세요. 마지막 점은 화살표 폭을 정합니다." : "번호 순서대로 기준점을 찍으세요."} aria-label={taskLabel(task)} aria-pressed={mode.type === 'draw-task' && mode.definitionId === task.id}
        className={`min-w-0 space-y-2 rounded border bg-surface p-3 text-left hover:border-secondary ${mode.type === 'draw-task' && mode.definitionId === task.id ? 'border-secondary bg-secondary/10' : 'border-outline-variant'}`}
        onClick={() => onModeChange({ type: 'draw-task', definitionId: task.id, affiliation })}>
        <TaskPreview task={task} />
        <span className="block text-[13px] text-on-surface">{taskLabel(task)}</span>
        <span className="block text-[11px] text-secondary">{task.standard === '2525E' ? 'MIL-STD-2525E' : 'NATO APP-6D'} · 기준점 {task.minPoints === task.maxPoints ? task.minPoints : `${task.minPoints}–${task.maxPoints}`}개</span>
      </button>)}
    </div>
  </section>;
}
