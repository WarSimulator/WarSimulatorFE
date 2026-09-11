import { simulationUnits } from '../../../mocks/units';
import type { SimulationRuntimeState } from '../../../types';

export const SIMULATION_DURATION = 600;
export const SIMULATION_PLAYBACK_RATE = 0.25;

export function createInitialRuntimeState(): SimulationRuntimeState {
  return {
    simulationTime: 0,
    isPlaying: false,
    playbackSpeed: 0.5,
    selectedUnitId: simulationUnits[0].id,
    activeTab: 'map',
    tacticalLayers: {
      routes: true,
      controlLines: true,
      labels: true,
    },
    worldClockCountryCode: 'KR',
  };
}

export function formatSimulationClock(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(clamped / 3_600)).padStart(2, '0');
  const minutes = String(Math.floor(clamped % 3_600 / 60)).padStart(2, '0');
  const secs = String(clamped % 60).padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

export function clampSimulationTime(seconds: number) {
  return Math.max(0, Math.min(SIMULATION_DURATION, seconds));
}
