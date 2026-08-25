import { Icon } from '../../../components/layout/Icon';
import type { DeploymentSetup } from '../../../types';
import { DeploymentPreview } from './DeploymentPreview';
import { DeploymentTabBar } from './DeploymentTabBar';

type DeploymentSetupPanelProps = {
  deployment?: DeploymentSetup;
  deployments: DeploymentSetup[];
  activeDeploymentId?: string;
  onSelectDeployment: (deploymentId: string) => void;
  onCreateEmptyDeployment: () => void;
  onDuplicateCurrentDeployment: () => void;
  onCloseDeployment: (deploymentId: string) => void;
  onCreate: () => void;
  onEdit: () => void;
};

export function DeploymentSetupPanel({
  deployment,
  deployments,
  activeDeploymentId,
  onSelectDeployment,
  onCreateEmptyDeployment,
  onDuplicateCurrentDeployment,
  onCloseDeployment,
  onCreate,
  onEdit,
}: DeploymentSetupPanelProps) {
  const friendlyCount = deployment?.units.filter((unit) => unit.affiliation === 'friendly').length ?? 0;
  const enemyCount = deployment?.units.filter((unit) => unit.affiliation === 'enemy').length ?? 0;
  const objectiveCount = deployment?.objectives.length ?? 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded border border-outline-variant bg-surface-container-high">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container px-4 py-3">
        <h3 className="font-label-caps text-label-caps text-on-surface">DEPLOYMENT SETUP</h3>
      </div>
      <DeploymentTabBar
        deployments={deployments}
        activeDeploymentId={activeDeploymentId}
        onSelect={onSelectDeployment}
        onCreateEmpty={onCreateEmptyDeployment}
        onDuplicateCurrent={onDuplicateCurrentDeployment}
        onClose={onCloseDeployment}
      />

      {!deployment ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-[420px] text-center">
            <Icon name="deployed_code" className="text-[42px] text-outline" />
            <h4 className="mt-4 font-headline-md text-headline-md text-on-surface">NO DEPLOYMENT SETUP</h4>
            <p className="mt-3 font-body-base text-body-base text-on-surface-variant">
              No initial force deployment has been configured for this simulation.
            </p>
            <button
              className="mt-6 rounded bg-secondary px-6 py-3 font-label-caps text-label-caps text-on-secondary transition-colors hover:bg-secondary-container"
              onClick={onCreate}
            >
              CREATE DEPLOYMENT SETUP
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-[240px]">
              <h4 className="font-headline-md text-headline-md text-primary">{deployment.name}</h4>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 font-data-mono text-[10px] text-primary">
                Friendly {friendlyCount}
              </span>
              <span className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 font-data-mono text-[10px] text-error">
                Enemy {enemyCount}
              </span>
              <span className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 font-data-mono text-[10px] text-secondary">
                Obj {objectiveCount}
              </span>
              <button
                className="ml-1 rounded border border-outline-variant px-4 py-2 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant"
                onClick={onEdit}
              >
                EDIT DEPLOYMENT
              </button>
            </div>
          </div>

          <DeploymentPreview deployment={deployment} />
        </div>
      )}
    </section>
  );
}
