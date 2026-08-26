import { simulationRuns } from '../../../mocks/simulationRuns';
import type { SimulationRun } from '../../../types';

export function getSimulationRuns(): SimulationRun[] {
  return [...simulationRuns];
}

export function getSimulationRunById(simulationId: string): SimulationRun | undefined {
  return simulationRuns.find((run) => run.id === simulationId);
}
