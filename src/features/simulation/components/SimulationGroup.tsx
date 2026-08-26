import { Icon } from '../../../components/layout/Icon';
import type { SimulationRun } from '../../../types';
import { formatSimulationCreatedAt } from '../lib/simulationFormatters';
import { SimulationRunRow } from './SimulationRunRow';

export type SimulationRunGroup = {
  mettTcId: string;
  mettTcName: string;
  mettTcFileName: string;
  runs: SimulationRun[];
};

type SimulationGroupProps = {
  group: SimulationRunGroup;
  isOpen: boolean;
  onToggle: (mettTcId: string) => void;
  onOpenRun: (simulationId: string) => void;
};

export function SimulationGroup({ group, isOpen, onToggle, onOpenRun }: SimulationGroupProps) {
  const latestRun = group.runs[0];

  return (
    <section className="overflow-hidden rounded border border-outline-variant bg-surface-container">
      <button
        className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-secondary/60 ${
          isOpen ? 'border-b border-outline-variant bg-surface-container-high' : ''
        }`}
        aria-expanded={isOpen}
        onClick={() => onToggle(group.mettTcId)}
      >
        <span className="flex min-w-0 items-center gap-4">
          <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="shrink-0 text-on-surface-variant" />
          <span className="min-w-0">
            <span className={`block truncate font-label-caps text-label-caps uppercase tracking-widest ${isOpen ? 'text-secondary' : 'text-on-surface'}`}>
              {group.mettTcName}
              <span className="ml-2 font-data-mono text-[10px] normal-case tracking-normal text-on-surface-variant opacity-70">
                ({group.mettTcFileName})
              </span>
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-6 font-data-mono text-[10px] text-on-surface-variant">
          <span>{group.runs.length} SIMULATIONS</span>
          <span>Last run: {formatSimulationCreatedAt(latestRun.createdAt)}</span>
        </span>
      </button>

      {isOpen && (
        <div className="divide-y divide-outline-variant bg-surface-container-lowest">
          {group.runs.map((run) => (
            <SimulationRunRow key={run.id} run={run} onOpen={onOpenRun} />
          ))}
        </div>
      )}
    </section>
  );
}
