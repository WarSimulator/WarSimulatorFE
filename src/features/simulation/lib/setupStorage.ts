import { defaultSimulationSetup } from '../../../mocks/simulations';
import type { SimulationSetupState } from '../../../types';

const STORAGE_KEY = 'atlas-defense.simulation-setup';

export function loadSimulationSetup(): SimulationSetupState {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return defaultSimulationSetup;
  }

  try {
    return JSON.parse(stored) as SimulationSetupState;
  } catch {
    return defaultSimulationSetup;
  }
}

export function saveSimulationSetup(state: SimulationSetupState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
