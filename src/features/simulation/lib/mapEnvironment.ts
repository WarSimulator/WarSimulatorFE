export type MapEnvironment = {
  time: 'day' | 'night';
  weather: 'clear' | 'rain' | 'snow';
  intensity: 1 | 2 | 3;
  snowCover: number;
  waterLevel: number;
};

export const DEFAULT_ENVIRONMENT: MapEnvironment = {
  time: 'day', weather: 'clear', intensity: 2, snowCover: 65, waterLevel: 45,
};

// Shared by the editor and playback maps, including when they unmount on mode changes.
let environment = DEFAULT_ENVIRONMENT;
const listeners = new Set<() => void>();
export const getMapEnvironment = () => environment;
export function subscribeMapEnvironment(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function updateMapEnvironment(patch: Partial<MapEnvironment>) {
  environment = { ...environment, ...patch };
  listeners.forEach(listener => listener());
}

/** Visual coverage only: does not model water flow, infiltration or snow mass. */
export function surfaceCoverage(height: number, neighbors: number[], spacing: number, settings: MapEnvironment) {
  if (!Number.isFinite(height) || neighbors.some(value => !Number.isFinite(value))) return 0;
  const slope = Math.max(...neighbors.map(value => Math.abs(value - height))) / Math.max(1, spacing);
  if (settings.weather === 'snow') {
    return settings.snowCover / 100 * Math.max(0.12, 1 - slope * 1.8);
  }
  if (settings.weather === 'rain') {
    // Wet low, gently sloping pockets; never paint steep mountain faces as water.
    const relief = neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length - height;
    const level = settings.waterLevel / 100;
    return level * Math.max(0, 1 - slope * 8) * Math.max(0, Math.min(1, relief / 3 + level * 0.35));
  }
  return 0;
}
