import { Icon } from '../../../components/layout/Icon';
import type { SimulationUnit } from '../../../types';

type UnitDetailPanelProps = {
  unit: SimulationUnit;
};

export function UnitDetailPanel({ unit }: UnitDetailPanelProps) {
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
            <span className="font-label-caps text-[9px] text-outline">현재 상태</span>
            <p className="mt-1 font-data-mono text-[12px] text-secondary">{unit.status}</p>
          </div>
          <div className="rounded border border-outline-variant/60 bg-surface p-3">
            <span className="font-label-caps text-[9px] text-outline">전투력</span>
            <p className="mt-1 font-data-mono text-[12px] text-primary">{unit.combatPower}%</p>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">현재 명령</h3>
          <p className="rounded border border-outline-variant bg-surface p-3 font-body-base text-[13px] leading-5 text-on-surface">{unit.currentOrder}</p>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">부대 상태</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['인원', unit.personnel],
              ['탄약', unit.ammunition],
              ['기동', unit.mobility],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-outline-variant bg-surface p-2 text-center">
                <p className="font-label-caps text-[9px] text-outline">{label}</p>
                <p className="mt-1 font-data-mono text-[11px] text-on-surface">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">명령 타임라인</h3>
          <div className="space-y-2">
            {unit.timeline.map((item) => (
              <div key={item} className="rounded border border-outline-variant/60 bg-surface p-2 font-data-mono text-[11px] text-on-surface">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-secondary">AI PLANNING ASSESSMENT</h3>
          <p className="rounded border border-secondary/30 bg-secondary/5 p-3 font-data-mono text-[11px] leading-5 text-on-surface-variant">
            Mock assessment: current unit posture remains consistent with selected OP ORDER constraints.
          </p>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-label-caps text-on-surface-variant">상황 로그</h3>
          <div className="space-y-1">
            {unit.log.map((item, index) => (
              <div key={item} className="flex gap-2 rounded p-2 font-data-mono text-[11px] hover:bg-surface-variant/50">
                <span className="text-outline">04:{String(12 + index * 3).padStart(2, '0')}:00</span>
                <span className="text-on-surface-variant">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
