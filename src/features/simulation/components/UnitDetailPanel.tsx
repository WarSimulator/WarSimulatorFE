import { Icon } from '../../../components/layout/Icon';
import type { SimulationUnit } from '../../../types';
import { UnitStateGraphs } from './UnitStateGraphs';

type UnitDetailPanelProps = {
  unit: SimulationUnit;
};

export function UnitDetailPanel({ unit }: UnitDetailPanelProps) {
  const agent = unit.agentState;
  const metric = (value: number | undefined) => `${Math.round(value ?? 0)}%`;
  return (
    <aside className="flex h-full w-[340px] flex-col border-l border-outline-variant bg-surface-container/95">
      <div className="border-b border-outline-variant bg-surface-container-highest p-4">
        <p className="font-label-caps text-label-caps text-on-surface-variant">SELECTED UNIT</p>
        <div className="mt-3 flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center border-2 ${unit.allegiance === 'Enemy' ? 'border-error bg-error/20 text-error' : unit.allegiance === 'Objective' ? 'border-secondary bg-secondary/20 text-secondary' : 'border-primary bg-primary/20 text-primary'}`}>
            <Icon name={unit.icon} className="text-[24px]" />
          </div>
          <div>
            <h2 className="font-headline-md text-[18px] text-primary">{unit.name}</h2>
            <p className="font-data-mono text-[11px] text-on-surface-variant">{unit.type}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded border border-outline-variant/60 bg-surface p-3">
            <span className="font-label-caps text-[9px] text-outline">명령 상태</span>
            <p className="mt-1 font-data-mono text-[12px] text-secondary">{agent?.commandState ?? unit.status}</p>
          </div>
          <div className="rounded border border-outline-variant/60 bg-surface p-3">
            <span className="font-label-caps text-[9px] text-outline">전투준비도</span>
            <p className="mt-1 font-data-mono text-[12px] text-primary">{agent?.readinessState ?? 'EFFECTIVE'}</p>
          </div>
        </section>

        <UnitStateGraphs command={agent?.commandState} readiness={agent?.readinessState} />

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">현재 명령 / 실행 모드</h3>
          <p className="rounded border border-outline-variant bg-surface p-3 font-body-base text-[13px] leading-5 text-on-surface">
            {agent?.currentOrder ?? unit.currentOrder}
            {agent?.executionMode ? <span className="mt-1 block font-data-mono text-[11px] text-secondary">{agent.executionMode}</span> : null}
          </p>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">에이전트 상태</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['탄약', metric(agent?.ammunitionPct)],
              ['피해', metric(agent?.damagePct)],
              ['피로', metric(agent?.fatiguePct)],
              ['기동', metric(agent?.mobilityPct)],
              ['제압', metric(agent?.suppressionPct)],
              ['전투력', metric(agent?.combatPowerPct)],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-outline-variant bg-surface p-2 text-center">
                <p className="font-label-caps text-[9px] text-outline">{label}</p>
                <p className="mt-1 font-data-mono text-[11px] text-on-surface">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">전이 Guard</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['MOVE', agent?.canMove],
              ['FIRE', agent?.canFire],
              ['OBSERVE', agent?.canObserve],
            ].map(([label, allowed]) => (
              <div key={label as string} className="rounded border border-outline-variant bg-surface p-2 text-center">
                <p className="font-label-caps text-[9px] text-outline">{label}</p>
                <p className={`mt-1 font-data-mono text-[11px] ${allowed ? 'text-secondary' : 'text-error'}`}>{allowed ? 'READY' : 'BLOCKED'}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">에이전트 보고</h3>
          <div className="space-y-1">
            {(agent?.reports ?? []).map((report, index) => (
              <div key={`${report.time}-${report.message}-${index}`} className="flex gap-2 rounded p-2 font-data-mono text-[11px] hover:bg-surface-variant/50">
                <span className="text-outline">H+{report.time.toFixed(1)}</span>
                <span className="text-on-surface-variant">{report.message}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
