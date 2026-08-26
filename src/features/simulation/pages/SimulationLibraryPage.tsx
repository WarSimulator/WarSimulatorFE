import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/layout/Icon';
import type { SimulationRun } from '../../../types';
import { SimulationGroup, type SimulationRunGroup } from '../components/SimulationGroup';
import { SimulationLibraryToolbar, type SimulationStatusFilter } from '../components/SimulationLibraryToolbar';
import { getSimulationRuns } from '../lib/simulationService';

function matchesSearch(run: SimulationRun, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [run.mettTcName, run.mettTcFileName, run.displayId, run.id, run.deploymentName]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

function groupSimulationRuns(runs: SimulationRun[]): SimulationRunGroup[] {
  const groups = new Map<string, SimulationRunGroup>();
  const sortedRuns = [...runs].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());

  sortedRuns.forEach((run) => {
    const currentGroup =
      groups.get(run.mettTcId) ??
      ({
        mettTcId: run.mettTcId,
        mettTcName: run.mettTcName,
        mettTcFileName: run.mettTcFileName,
        runs: [],
      } satisfies SimulationRunGroup);

    currentGroup.runs.push(run);
    groups.set(run.mettTcId, currentGroup);
  });

  return [...groups.values()];
}

export function SimulationLibraryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SimulationStatusFilter>('all');
  const [openGroupIds, setOpenGroupIds] = useState<string[]>([]);
  const runs = useMemo(() => getSimulationRuns(), []);

  const filteredGroups = useMemo(() => {
    const filteredRuns = runs.filter((run) => {
      const statusMatches = statusFilter === 'all' || run.status === statusFilter;
      return statusMatches && matchesSearch(run, searchQuery);
    });

    return groupSimulationRuns(filteredRuns);
  }, [runs, searchQuery, statusFilter]);

  useEffect(() => {
    if (filteredGroups.length === 0) {
      return;
    }

    setOpenGroupIds((current) => {
      if (current.some((groupId) => filteredGroups.some((group) => group.mettTcId === groupId))) {
        return current;
      }
      return [filteredGroups[0].mettTcId];
    });
  }, [filteredGroups]);

  const toggleGroup = (mettTcId: string) => {
    setOpenGroupIds((current) => (current.includes(mettTcId) ? current.filter((groupId) => groupId !== mettTcId) : [...current, mettTcId]));
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-container-padding">
      <header className="flex items-end justify-between gap-6">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface">SIMULATION LIBRARY</h2>
          <p className="mt-1 font-data-mono text-sm text-on-surface-variant">Review and manage previous simulation runs.</p>
        </div>
        <SimulationLibraryToolbar
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          onSearchChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
        />
      </header>

      {filteredGroups.length > 0 ? (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <SimulationGroup
              key={group.mettTcId}
              group={group}
              isOpen={openGroupIds.includes(group.mettTcId)}
              onToggle={toggleGroup}
              onOpenRun={(simulationId) => navigate(`/simulations/${simulationId}`)}
            />
          ))}
        </div>
      ) : (
        <section className="flex min-h-[420px] items-center justify-center rounded border border-outline-variant bg-surface-container">
          <div className="max-w-[460px] text-center">
            <Icon name="database" className="text-[42px] text-outline" />
            <h3 className="mt-4 font-headline-md text-headline-md text-on-surface">
              {runs.length === 0 ? 'NO SIMULATIONS YET' : 'NO MATCHING SIMULATIONS'}
            </h3>
            <p className="mt-3 font-body-base text-body-base text-on-surface-variant">
              {runs.length === 0
                ? 'Simulation runs will appear here after you start a simulation.'
                : 'Adjust the search term or status filter to locate a simulation run.'}
            </p>
            <button
              className="mt-6 rounded bg-secondary px-6 py-3 font-label-caps text-label-caps text-on-secondary transition-colors hover:bg-secondary-container"
              onClick={() => navigate('/simulations/setup')}
            >
              GO TO SIMULATION SETUP
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
