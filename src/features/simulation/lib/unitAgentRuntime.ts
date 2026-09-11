import type { DeploymentSetup, SimulationResult, UnitAgentState } from '../../../types';
import { getUnitAgentState } from './unitAgent';

type AgentBoundary = { time: number; unitId: string };

/**
 * One shared agent runtime owns every unit FSM on the common simulation clock.
 * It advances snapshots only at command boundaries; selecting a unit only reads
 * its already-owned agent state and never creates a new FSM.
 */
export type UnitAgentRuntime = {
  advanceTo: (simulationTime: number) => void;
  seekTo: (simulationTime: number) => void;
  getState: (unitId: string, simulationTime: number) => UnitAgentState | undefined;
};

export function createUnitAgentRuntime(
  result: SimulationResult,
  deployment: DeploymentSetup | undefined,
  unitIds: string[],
): UnitAgentRuntime {
  const deploymentById = new Map(deployment?.units.map(unit => [unit.id, unit]));
  const uniqueUnitIds = [...new Set(unitIds)];
  const boundaries: AgentBoundary[] = (result.actionEffects ?? [])
    .flatMap(effect => [{ time: effect.startTime, unitId: effect.unitId }, { time: effect.endTime, unitId: effect.unitId }])
    .sort((first, second) => first.time - second.time);
  const snapshots = new Map(uniqueUnitIds.map(unitId => [unitId, getUnitAgentState(result, deploymentById.get(unitId), unitId, result.startTime)]));
  let boundaryIndex = 0;
  let currentTime = result.startTime;

  const resetToStart = () => {
    snapshots.clear();
    uniqueUnitIds.forEach(unitId => snapshots.set(unitId, getUnitAgentState(result, deploymentById.get(unitId), unitId, result.startTime)));
    boundaryIndex = 0;
    currentTime = result.startTime;
  };

  const advanceTo = (simulationTime: number) => {
    // Only an explicit seek may rewind the engine. A delayed UI read must not.
    if (simulationTime < currentTime) return;
    while (boundaryIndex < boundaries.length && boundaries[boundaryIndex].time <= simulationTime) {
      const boundary = boundaries[boundaryIndex];
      snapshots.set(boundary.unitId, getUnitAgentState(result, deploymentById.get(boundary.unitId), boundary.unitId, boundary.time));
      boundaryIndex += 1;
    }
    currentTime = simulationTime;
    if (simulationTime >= result.endTime) {
      uniqueUnitIds.forEach(unitId => snapshots.set(unitId, getUnitAgentState(result, deploymentById.get(unitId), unitId, simulationTime)));
    }
  };

  return {
    advanceTo,
    seekTo: (simulationTime) => {
      if (simulationTime < currentTime) resetToStart();
      advanceTo(simulationTime);
    },
    getState: (unitId, simulationTime) => {
      const snapshot = snapshots.get(unitId);
      // The state machine remains event-driven. Only an executing selected unit
      // needs a time-interpolated display of consumables between boundaries.
      return snapshot && (simulationTime !== currentTime || snapshot.commandState === 'EXECUTING')
        ? getUnitAgentState(result, deploymentById.get(unitId), unitId, simulationTime)
        : snapshot;
    },
  };
}
