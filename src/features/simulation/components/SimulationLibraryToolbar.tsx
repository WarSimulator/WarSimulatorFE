import { Icon } from '../../../components/layout/Icon';
import type { SimulationStatus } from '../../../types';

export type SimulationStatusFilter = 'all' | SimulationStatus;

type SimulationLibraryToolbarProps = {
  searchQuery: string;
  statusFilter: SimulationStatusFilter;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: SimulationStatusFilter) => void;
};

const statusOptions: SimulationStatusFilter[] = ['all', 'planning', 'running', 'completed', 'failed'];

export function SimulationLibraryToolbar({
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
}: SimulationLibraryToolbarProps) {
  return (
    <div className="flex items-center gap-4">
      <label className="relative block">
        <span className="sr-only">Search simulations</span>
        <Icon name="search" className="absolute left-3 top-1/2 text-[16px] text-on-surface-variant -translate-y-1/2" />
        <input
          className="w-64 rounded border border-outline-variant bg-surface-container-highest py-2 pl-9 pr-4 font-data-mono text-xs text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-secondary focus:ring-1 focus:ring-secondary"
          placeholder="Search simulations..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <label className="relative block">
        <span className="sr-only">Filter simulation status</span>
        <Icon name="filter_list" className="absolute left-3 top-1/2 text-[16px] text-on-surface-variant -translate-y-1/2" />
        <select
          className="appearance-none rounded border border-outline-variant bg-surface-container-highest py-2 pl-9 pr-9 font-data-mono text-xs uppercase text-on-surface outline-none transition-colors hover:bg-surface-variant focus:border-secondary focus:ring-1 focus:ring-secondary"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as SimulationStatusFilter)}
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              STATUS: {status}
            </option>
          ))}
        </select>
        <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 text-[16px] text-on-surface-variant -translate-y-1/2" />
      </label>
    </div>
  );
}
