import { simulationUnits } from '../../../mocks/units';
import type { SimulationRuntimeState } from '../../../types';

export const SIMULATION_DURATION = 600;

export function createInitialRuntimeState(): SimulationRuntimeState {
  return {
    simulationTime: 0,
    isPlaying: false,
    playbackSpeed: 1,
    selectedUnitId: simulationUnits[0].id,
    activeTab: 'map',
    tacticalLayers: {
      routes: true,
      controlLines: true,
      labels: true,
    },
  };
}

export function formatSimulationClock(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(clamped / 60)).padStart(2, '0');
  const secs = String(clamped % 60).padStart(2, '0');
  return `04:${minutes}:${secs}`;
}

export function clampSimulationTime(seconds: number) {
  return Math.max(0, Math.min(SIMULATION_DURATION, seconds));
}
