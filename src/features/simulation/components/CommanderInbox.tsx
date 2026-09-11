import type { UnitAgentReport } from '../../../types';

type Props = {
  reports: UnitAgentReport[];
  simulationTime: number;
  onSelectUnit: (unitId: string) => void;
};

const severityStyle = {
  info: 'border-secondary/40 bg-secondary/10 text-secondary',
  warning: 'border-primary/50 bg-primary/10 text-primary',
  critical: 'border-error/50 bg-error/10 text-error',
} as const;

export function CommanderInbox({ reports, simulationTime, onSelectUnit }: Props) {
  const delivered = reports.filter(report => report.time <= simulationTime).reverse();
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-surface-container-lowest p-6">
      <div className="border-b border-outline-variant pb-4">
        <p className="font-label-caps text-label-caps text-secondary">AI COMMANDER / EVENT LOG</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-headline-md text-[22px] text-on-surface">Commander Inbox</h2>
            <p className="mt-1 font-data-mono text-[11px] text-on-surface-variant">STRUCTURED ENGLISH REPORTS · DELIVERED THROUGH H+{simulationTime.toFixed(1)}</p>
          </div>
          <span className="rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[11px] text-primary">{delivered.length} DELIVERED</span>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
        {delivered.length === 0 ? (
          <div className="rounded border border-dashed border-outline-variant p-8 text-center font-data-mono text-[12px] text-on-surface-variant">
            No reports delivered to AI Commander at the current simulation time.
          </div>
        ) : delivered.map((report) => (
          <button
            key={report.id}
            type="button"
            onClick={() => onSelectUnit(report.unitId)}
            className="w-full rounded border border-outline-variant bg-surface p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-variant/30"
          >
            <div className="flex flex-wrap items-center gap-2 font-data-mono text-[11px]">
              <span className="text-outline">H+{report.time.toFixed(1)}</span>
              <span className={`rounded border px-1.5 py-0.5 uppercase ${severityStyle[report.severity]}`}>{report.severity}</span>
              <span className="text-secondary">{report.type}</span>
              <span className="text-on-surface-variant">FROM</span>
              <span className="text-on-surface">{report.unitId}</span>
              <span className="text-outline">→ AI COMMANDER</span>
            </div>
            <p className="mt-2 text-[13px] text-on-surface">{report.message}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-data-mono text-[10px] text-on-surface-variant">
              <span>CMD {report.state.commandState}</span>
              <span>READINESS {report.state.readinessState}</span>
              <span>AMMO {Math.round(report.state.ammunitionPct)}%</span>
              <span>MOBILITY {Math.round(report.state.mobilityPct)}%</span>
              <span>FATIGUE {Math.round(report.state.fatiguePct)}%</span>
              {report.reason && <span className="text-error">REASON {report.reason}</span>}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
