import pipelineDeployment from '../../../fixtures/pipelineDeployment.json';
import pipelineSimulationResult from '../../../fixtures/pipelineSimulationResult.json';
import alphaLocalStorageDeployment from '../../../fixtures/alphaDeployment.json';
import alphaLocalStorageSimulationResult from '../../../fixtures/alphaDeploymentTfdSimulationResult.json';
import engineSimulationResult from '../../../fixtures/engineSimulationResult.json';
import alphaDeployment from '../../../../deployment.json';
import type { DeploymentSetup, SimulationResult, SimulationUnit, UnitAgentState } from '../../../types';
import { getUnitSidc } from './sidc';
import { getFinalSimulation, getFinalSimulationDeployment } from './finalSimulation';
import { getUnitAgentState } from './unitAgent';

const result = pipelineSimulationResult as SimulationResult;
const exampleDeployment = pipelineDeployment as DeploymentSetup;
const alphaDeploymentExample = alphaLocalStorageDeployment as unknown as DeploymentSetup;
const alphaResultExample = alphaLocalStorageSimulationResult as SimulationResult;

const actorPresentation: Record<string, Pick<SimulationUnit, 'name' | 'type' | 'icon'>> = {
  alpha_coy: {
    name: 'ALPHA COY',
    type: 'INF CO',
    icon: 'security',
  },
  bravo_coy: {
    name: 'BRAVO COY',
    type: 'MECH INF CO',
    icon: 'directions_car',
  },
  charlie_coy: {
    name: 'CHARLIE COY',
    type: 'ARMOR CO',
    icon: 'local_shipping',
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
  const imported = getFinalSimulation(simulationId);
  if (imported) return imported.result;
  return simulationId === 'alpha-localstorage' ? alphaResultExample : result;
}

/** Returns the paired deployment fixture for the engine-produced example result. */
export function getSimulationResultDeployment(deploymentId?: string): DeploymentSetup | undefined {
  const imported = getFinalSimulationDeployment(deploymentId);
  if (imported) return imported;
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

export function getSimulationResultUnits(simulationResult: SimulationResult, deployment?: DeploymentSetup, simulationTime = simulationResult.startTime): SimulationUnit[] {
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
    const metadata = actorPresentation[track.actor] ?? { name: track.actor || track.unitId, type: 'UNIT', icon: 'security' };
    const agentState = getUnitAgentState(simulationResult, deploymentUnit, track.unitId, simulationTime);
    const firstPosition = track.segments[0]?.keyframes[0]?.position
      ?? simulationResult.actionEffects?.find((effect) => effect.unitId === track.unitId)?.origin
      ?? deploymentUnit?.position;

    return {
      id: track.unitId,
      name: deploymentUnit?.designation || metadata.name,
      allegiance: deploymentUnit?.affiliation === 'enemy' ? 'Enemy' : 'Friendly',
      type: deploymentUnit?.symbolLabel ?? metadata.type,
      status: agentState.commandState,
      combatPower: agentState.combatPowerPct,
      currentOrder: agentState.currentOrder,
      personnel: `${agentState.combatPowerPct}%`,
      ammunition: `${agentState.ammunitionPct}%`,
      mobility: `${agentState.mobilityPct}%`,
      position: { x: 35 + index * 12, y: 45 },
      icon: metadata.icon,
      timeline: agentState.reports.map(report => `H+${report.time.toFixed(1)} ${report.message}`),
      log: agentState.reports.map(report => report.message),
      agentState,
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

/** Resolves only one live unit for the detail panel, avoiding a full roster rebuild on every frame. */
export function getSimulationResultUnit(
  simulationResult: SimulationResult,
  deployment: DeploymentSetup | undefined,
  unitId: string,
  simulationTime: number,
  roster?: SimulationUnit[],
  runtimeAgentState?: UnitAgentState,
): SimulationUnit | undefined {
  const staticUnit = (roster ?? getSimulationResultUnits(simulationResult, deployment, simulationResult.startTime))
    .find((unit) => unit.id === unitId);
  if (!staticUnit) return undefined;
  const deploymentUnit = deployment?.units.find((unit) => unit.id === unitId);
  const agentState = runtimeAgentState ?? getUnitAgentState(simulationResult, deploymentUnit, unitId, simulationTime);
  return {
    ...staticUnit,
    status: agentState.commandState,
    combatPower: agentState.combatPowerPct,
    currentOrder: agentState.currentOrder,
    personnel: `${agentState.combatPowerPct}%`,
    ammunition: `${agentState.ammunitionPct}%`,
    mobility: `${agentState.mobilityPct}%`,
    timeline: agentState.reports.map(report => `H+${report.time.toFixed(1)} ${report.message}`),
    log: agentState.reports.map(report => report.message),
    agentState,
  };
}
