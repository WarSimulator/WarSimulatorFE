import pipelineDeployment from '../../../fixtures/pipelineDeployment.json';
import pipelineSimulationResult from '../../../fixtures/pipelineSimulationResult.json';
import alphaLocalStorageDeployment from '../../../fixtures/alphaDeployment.json';
import alphaLocalStorageSimulationResult from '../../../fixtures/alphaDeploymentTfdSimulationResult.json';
import engineSimulationResult from '../../../fixtures/engineSimulationResult.json';
import alphaDeployment from '../../../../deployment.json';
import type { DeploymentSetup, SimulationResult, SimulationUnit } from '../../../types';
import { getUnitSidc } from './sidc';

const result = pipelineSimulationResult as SimulationResult;
const exampleDeployment = pipelineDeployment as DeploymentSetup;
const alphaDeploymentExample = alphaLocalStorageDeployment as unknown as DeploymentSetup;
const alphaResultExample = alphaLocalStorageSimulationResult as SimulationResult;

const actorLabels: Record<string, Pick<SimulationUnit, 'name' | 'type' | 'status' | 'combatPower' | 'currentOrder' | 'personnel' | 'ammunition' | 'mobility' | 'icon' | 'timeline' | 'log'>> = {
  alpha_coy: {
    name: 'ALPHA COY',
    type: 'INF CO',
    status: 'MOVING',
    combatPower: 86,
    currentOrder: 'Move from current position to LD LINE GOLD.',
    personnel: '94%',
    ammunition: '78%',
    mobility: 'MOBILE',
    icon: 'security',
    timeline: ['H+00 ACTION_STARTED Move', 'H+10 ACTION_COMPLETED Move'],
    log: ['Move action started.', 'Tracking toward LD LINE GOLD.'],
  },
  bravo_coy: {
    name: 'BRAVO COY',
    type: 'MECH INF CO',
    status: 'MOVING',
    combatPower: 82,
    currentOrder: 'Move from current position to LD LINE GOLD.',
    personnel: '91%',
    ammunition: '74%',
    mobility: 'MOBILE',
    icon: 'directions_car',
    timeline: ['H+00 ACTION_STARTED Move', 'H+10 ACTION_COMPLETED Move'],
    log: ['Move action started.', 'Maintaining parallel axis.'],
  },
  charlie_coy: {
    name: 'CHARLIE COY',
    type: 'ARMOR CO',
    status: 'MOVING',
    combatPower: 89,
    currentOrder: 'Move from current position to LD LINE GOLD.',
    personnel: '96%',
    ammunition: '81%',
    mobility: 'MOBILE',
    icon: 'local_shipping',
    timeline: ['H+00 ACTION_STARTED Move', 'H+10 ACTION_COMPLETED Move'],
    log: ['Move action started.', 'Advancing on assigned endpoint.'],
  },
};

const actorSidc: Record<string, string> = {
  alpha_coy: getUnitSidc({ affiliation: 'friendly', unitType: 'infantry', echelon: 'company' }),
  bravo_coy: getUnitSidc({ affiliation: 'friendly', unitType: 'mechanized_infantry', echelon: 'company' }),
  charlie_coy: getUnitSidc({ affiliation: 'friendly', unitType: 'armor', echelon: 'company' }),
};

export function getMoveSimulationResult(): SimulationResult {
  return result;
}

/** Selects between the dynamic demonstration and the exact Alpha localStorage fixture. */
export function getSimulationResult(simulationId?: string): SimulationResult {
  return simulationId === 'alpha-localstorage' ? alphaResultExample : result;
}

/** Returns the paired deployment fixture for the engine-produced example result. */
export function getSimulationResultDeployment(deploymentId?: string): DeploymentSetup | undefined {
  if (deploymentId === exampleDeployment.id) return exampleDeployment;
  if (deploymentId === alphaDeploymentExample.id) return alphaDeploymentExample;
  return undefined;
}

/** Compatibility loader for the richer engine fixture used by local renderer checks. */
export function loadSimulationResult(): SimulationResult {
  return engineSimulationResult as SimulationResult;
}

export function loadSimulationDeployment(): DeploymentSetup {
  return alphaDeployment as unknown as DeploymentSetup;
}

export function validateSimulationResultReferences(simulationResult: SimulationResult, deployment: DeploymentSetup) {
  const identifiers = new Set(deployment.units.flatMap((unit) => [unit.id, unit.designation]));
  for (const track of simulationResult.unitTracks) {
    if (!identifiers.has(track.unitId) && !identifiers.has(track.actor)) {
      throw new Error(`Simulation track does not resolve to a deployment unit: ${track.unitId}`);
    }
  }
}

export function getSimulationResultUnits(simulationResult: SimulationResult, deployment?: DeploymentSetup): SimulationUnit[] {
  const symbolScaleByUnitId = new Map(deployment?.units.map((unit) => [unit.id, unit.symbolScale ?? 1]));

  const tracks = [...simulationResult.unitTracks];
  for (const effect of simulationResult.actionEffects ?? []) {
    if (!tracks.some(track => track.unitId === effect.unitId)) {
      tracks.push({ unitId: effect.unitId, actor: effect.actor, startTime: effect.startTime, endTime: effect.endTime, segments: [] });
    }
  }
  for (const deploymentUnit of deployment?.units ?? []) {
    if (!tracks.some((track) => track.unitId === deploymentUnit.id)) {
      tracks.push({
        unitId: deploymentUnit.id,
        actor: deploymentUnit.designation,
        startTime: simulationResult.startTime,
        endTime: simulationResult.endTime,
        segments: [],
      });
    }
  }
  return tracks.map((track, index) => {
    const deploymentUnit = deployment?.units.find((unit) => unit.id === track.unitId);
    const metadata = actorLabels[track.actor] ?? actorLabels.alpha_coy;
    const firstPosition = track.segments[0]?.keyframes[0]?.position
      ?? simulationResult.actionEffects?.find((effect) => effect.unitId === track.unitId)?.origin
      ?? deploymentUnit?.position;

    return {
      id: track.unitId,
      name: deploymentUnit?.designation || metadata.name,
      allegiance: deploymentUnit?.affiliation === 'enemy' ? 'Enemy' : 'Friendly',
      type: deploymentUnit?.symbolLabel ?? metadata.type,
      status: metadata.status,
      combatPower: metadata.combatPower,
      currentOrder: metadata.currentOrder,
      personnel: metadata.personnel,
      ammunition: metadata.ammunition,
      mobility: metadata.mobility,
      position: { x: 35 + index * 12, y: 45 },
      icon: metadata.icon,
      timeline: metadata.timeline,
      log: metadata.log,
      // Engine actors are scenario identifiers, whereas map symbols are owned by
      // the Deployment unit IDs. Prefer the latter so arbitrary plan actors render.
      sidc: deploymentUnit?.sidc ?? actorSidc[track.actor],
      symbolStandard: deploymentUnit?.symbolStandard,
      symbolScale: symbolScaleByUnitId.get(track.unitId) ?? 1,
      symbolRotation: deployment?.units.find(unit => unit.id === track.unitId)?.symbolRotation ?? 0,
      geographicPosition: firstPosition,
    } satisfies SimulationUnit & { sidc?: string; geographicPosition?: { longitude: number; latitude: number } };
  });
}
