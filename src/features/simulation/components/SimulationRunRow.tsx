import { Icon } from '../../../components/layout/Icon';
import type { SimulationRun } from '../../../types';
import { formatSimulationCreatedAt } from '../lib/simulationFormatters';
import { SimulationStatusBadge } from './SimulationStatusBadge';

type SimulationRunRowProps = {
  run: SimulationRun;
  onOpen: (simulationId: string) => void;
};

export function SimulationRunRow({ run, onOpen }: SimulationRunRowProps) {
  return (
    <button
      className="group flex w-full cursor-pointer items-center justify-between px-6 py-4 text-left transition-colors hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none focus:ring-1 focus:ring-secondary/60"
      onClick={() => onOpen(run.id)}
    >
      <span className="flex min-w-0 flex-1 items-center gap-8">
        <span className="w-32 shrink-0 font-data-mono text-[10px] text-on-surface">{run.displayId}</span>
        <span className="min-w-0 flex-1 truncate font-data-mono text-[10px] text-on-surface-variant">
          Deployment: {run.deploymentName}
        </span>
        <span className="w-40 shrink-0 font-data-mono text-[10px] text-on-surface-variant">
          Created: {formatSimulationCreatedAt(run.createdAt)}
        </span>
        <SimulationStatusBadge status={run.status} />
        <span className="w-20 shrink-0 font-data-mono text-[10px] text-on-surface-variant">COAs: {run.coaCount ?? '-'}</span>
      </span>
      <Icon name="chevron_right" className="ml-4 text-[20px] text-on-surface-variant transition-colors group-hover:text-secondary" />
    </button>
  );
}
