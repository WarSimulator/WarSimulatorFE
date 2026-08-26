import type { SimulationStatus } from '../../../types';

type SimulationStatusBadgeProps = {
  status: SimulationStatus;
};

const statusStyles: Record<SimulationStatus, string> = {
  planning: 'text-on-surface-variant',
  running: 'text-secondary',
  completed: 'text-secondary',
  failed: 'text-error',
};

const dotStyles: Record<SimulationStatus, string> = {
  planning: 'bg-outline',
  running: 'bg-secondary animate-soft-pulse',
  completed: 'bg-secondary',
  failed: 'bg-error',
};

export function SimulationStatusBadge({ status }: SimulationStatusBadgeProps) {
  return (
    <span className={`flex w-32 items-center gap-2 font-data-mono text-[10px] uppercase ${statusStyles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {status}
    </span>
  );
}
