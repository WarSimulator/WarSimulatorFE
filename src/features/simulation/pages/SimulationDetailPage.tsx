import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../../components/layout/Icon';
import { getSimulationRunById } from '../lib/simulationService';
import { formatSimulationCreatedAt } from '../lib/simulationFormatters';
import { SimulationStatusBadge } from '../components/SimulationStatusBadge';

export function SimulationDetailPage() {
  const { simulationId } = useParams();
  const run = simulationId ? getSimulationRunById(simulationId) : undefined;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-container-padding">
      <div className="flex items-center justify-between border-b border-outline-variant pb-4">
        <div>
          <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
            <Icon name="database" className="text-[24px] text-secondary" />
            {run?.displayId ?? 'SIMULATION DETAIL'}
          </h2>
          <p className="mt-1 font-data-mono text-sm text-on-surface-variant">Simulation Detail / Result Coming Soon</p>
        </div>
        <Link
          className="rounded border border-outline-variant px-4 py-2 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant"
          to="/simulations/library"
        >
          BACK TO LIBRARY
        </Link>
      </div>

      <section className="rounded border border-outline-variant bg-surface-container p-6">
        {run ? (
          <div className="grid max-w-[720px] grid-cols-[160px_1fr] gap-x-6 gap-y-4 font-data-mono text-[12px]">
            <span className="text-on-surface-variant">METT-TC</span>
            <span className="text-on-surface">
              {run.mettTcName} <span className="text-on-surface-variant">({run.mettTcFileName})</span>
            </span>
            <span className="text-on-surface-variant">Deployment</span>
            <span className="text-on-surface">{run.deploymentName}</span>
            <span className="text-on-surface-variant">Created</span>
            <span className="text-on-surface">{formatSimulationCreatedAt(run.createdAt)}</span>
            <span className="text-on-surface-variant">Status</span>
            <SimulationStatusBadge status={run.status} />
            <span className="text-on-surface-variant">COAs</span>
            <span className="text-on-surface">{run.coaCount ?? '-'}</span>
          </div>
        ) : (
          <p className="font-body-base text-body-base text-on-surface-variant">The selected simulation run was not found in mock data.</p>
        )}
      </section>
    </div>
  );
}
