import type { SimulationSetupState } from '../types';

export const defaultSimulationSetup: SimulationSetupState = {
  selectedScenarioId: 'scenario-alpha',
  fidelityMode: 'Balanced',
  timeScale: '1x',
  randomSeed: 'ATLAS-1042',
  options: {
    fogOfWar: true,
    recordTelemetry: true,
    dynamicWeather: false,
    manualIntervention: true,
  },
};

export const initializationSteps = [
  'Validating OP ORDER...',
  'Preparing COA...',
  'Loading units...',
  'Preparing simulation environment...',
];
