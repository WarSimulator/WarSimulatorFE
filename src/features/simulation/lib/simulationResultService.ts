import moveSimulationResult from '../../../mocks/moveSimulationResult.json';
import type { DeploymentSetup, SimulationResult, SimulationUnit } from '../../../types';
import { getUnitSidc } from './sidc';

const result = moveSimulationResult as SimulationResult;

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

export function getSimulationResultUnits(simulationResult: SimulationResult, deployment?: DeploymentSetup): SimulationUnit[] {
  const symbolScaleByUnitId = new Map(deployment?.units.map((unit) => [unit.id, unit.symbolScale ?? 1]));

  return simulationResult.unitTracks.map((track, index) => {
    const metadata = actorLabels[track.actor] ?? actorLabels.alpha_coy;
    const firstPosition = track.segments[0]?.keyframes[0]?.position;

    return {
      id: track.unitId,
      name: metadata.name,
      allegiance: 'Friendly',
      type: metadata.type,
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
      sidc: actorSidc[track.actor],
      symbolScale: symbolScaleByUnitId.get(track.unitId) ?? 1,
      geographicPosition: firstPosition,
    } satisfies SimulationUnit & { sidc?: string; geographicPosition?: { longitude: number; latitude: number } };
  });
}
