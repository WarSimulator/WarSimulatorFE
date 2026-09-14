import type { DeploymentSetup } from '../../../types';

export function removeDeploymentEntity(deployment: DeploymentSetup, entityId: string): DeploymentSetup {
  return {
    ...deployment,
    units: deployment.units.filter(item => item.id !== entityId),
    objectives: deployment.objectives.filter(item => item.id !== entityId),
    tacticalGraphics: deployment.tacticalGraphics.filter(item => item.id !== entityId),
  };
}
