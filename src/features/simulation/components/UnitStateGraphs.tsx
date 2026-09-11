import { memo, useId } from 'react';
import type { UnitCommandState, UnitReadinessState } from '../../../types';

type Props = { command?: UnitCommandState; readiness?: UnitReadinessState };

function StateNode({ x, y, lines, active }: {
  x: number; y: number; lines: string[]; active: boolean;
}) {
  return (
    <g aria-current={active ? 'true' : undefined}>
      <rect x={x} y={y} width="116" height="42" rx="5"
        className={active ? 'fill-secondary/15 stroke-secondary' : 'fill-surface stroke-outline-variant'}
        strokeWidth={active ? 2 : 1} />
      {active && <circle cx={x + 9} cy={y + 9} r="3" className="fill-secondary" />}
      <text x={x + 58} y={y + (lines.length === 1 ? 25 : 18)} textAnchor="middle"
        className={`font-data-mono text-[10px] ${active ? 'fill-secondary font-bold' : 'fill-on-surface-variant'}`}>
        {lines.map((line, index) => <tspan key={line} x={x + 58} dy={index ? 13 : 0}>{line}</tspan>)}
      </text>
    </g>
  );
}

/** Only discrete state changes redraw these graphs; resource ticks do not. */
export const UnitStateGraphs = memo(function UnitStateGraphs({ command, readiness }: Props) {
  const marker = `fsm-arrow-${useId().replace(/:/g, '')}`;
  const arrow = `url(#${marker})`;
  return (
    <section className="space-y-3" aria-label="선택 유닛 FSM 상태도">
      <div className="rounded border border-outline-variant bg-surface p-2">
        <h3 className="font-label-caps text-[10px] text-on-surface-variant">Command FSM</h3>
        <svg viewBox="0 0 280 170" className="mt-1 w-full" role="img"
          aria-label={`Command FSM 현재 상태: ${command ?? '정보 없음'}`}>
          <defs>
            <marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 Z" className="fill-outline" />
            </marker>
          </defs>
          <g fill="none" className="stroke-outline" strokeWidth="1" markerEnd={arrow}>
            <path d="M124 39 H156" />
            <path d="M164 24 Q140 0 116 24" />
            <path d="M66 66 V116" />
            <path d="M124 62 L184 116" strokeDasharray="3 3" />
          </g>
          <g textAnchor="middle" className="fill-on-surface-variant text-[9px]">
            <text x="140" y="32">명령</text>
            <text x="140" y="10">완료</text>
            <text x="38" y="95">종료</text>
            <text x="184" y="91">Guard 차단</text>
          </g>
          <StateNode x={8} y={24} lines={['READY']} active={command === 'READY'} />
          <StateNode x={156} y={24} lines={['EXECUTING']} active={command === 'EXECUTING'} />
          <StateNode x={8} y={118} lines={['STOPPED']} active={command === 'STOPPED'} />
          <StateNode x={156} y={118} lines={['HOLD']} active={command === 'HOLD'} />
        </svg>
        <p className="font-data-mono text-[10px] text-secondary">● 현재: {command ?? '정보 없음'}</p>
      </div>

      <div className="rounded border border-outline-variant bg-surface p-2">
        <h3 className="font-label-caps text-[10px] text-on-surface-variant">Readiness FSM</h3>
        <svg viewBox="0 0 280 146" className="mt-1 w-full" role="img"
          aria-label={`Readiness FSM 현재 상태: ${readiness ?? '정보 없음'}`}>
          <g fill="none" className="stroke-outline" strokeWidth="1" markerEnd={arrow}>
            <path d="M124 34 H156" />
            <path d="M214 55 V85 H66 V103" />
            <path d="M124 124 H156" />
          </g>
          <text x="140" y="76" textAnchor="middle" className="fill-on-surface-variant text-[9px]">전투준비도 저하</text>
          <StateNode x={8} y={13} lines={['EFFECTIVE']} active={readiness === 'EFFECTIVE'} />
          <StateNode x={156} y={13} lines={['DEGRADED']} active={readiness === 'DEGRADED'} />
          <StateNode x={8} y={103} lines={['CRITICAL']} active={readiness === 'CRITICAL'} />
          <StateNode x={156} y={103} lines={['COMBAT', 'INEFFECTIVE']} active={readiness === 'COMBAT_INEFFECTIVE'} />
        </svg>
        <p className="mt-1 font-data-mono text-[10px] text-secondary">● 현재: {readiness ?? '정보 없음'}</p>
        <p className="mt-1 text-[10px] text-on-surface-variant">현재 수치로 판정 · 중간 단계 생략 가능</p>
      </div>
    </section>
  );
});
