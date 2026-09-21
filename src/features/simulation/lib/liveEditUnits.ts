import type { DeploymentObjective, DeploymentUnit, TacticalGraphic } from '../../../types';

const KEY_PREFIX = 'atlas-defense.simulation-live-edit.';
const HIDDEN_KEY_PREFIX = 'atlas-defense.simulation-live-edit-hidden.';
const OBJECT_KEY_PREFIX = 'atlas-defense.simulation-live-edit-objects.';

export function loadLiveEditUnits(simulationId?: string): DeploymentUnit[] {
  if (!simulationId) return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(`${KEY_PREFIX}${simulationId}`) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((value): value is DeploymentUnit => {
      if (!value || typeof value !== 'object') return false;
      const unit = value as Partial<DeploymentUnit>;
      return typeof unit.id === 'string' && typeof unit.designation === 'string'
        && typeof unit.sidc === 'string' && (unit.affiliation === 'friendly' || unit.affiliation === 'enemy')
        && Number.isFinite(unit.position?.longitude) && Number.isFinite(unit.position?.latitude);
    });
  } catch {
    return [];
  }
}

export function saveLiveEditUnits(simulationId: string | undefined, units: DeploymentUnit[]) {
  if (!simulationId) return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${simulationId}`, JSON.stringify(units));
  } catch {
    // The current session keeps working even when browser storage is full.
  }
}

export function loadHiddenLiveEditUnitIds(simulationId?: string): string[] {
  if (!simulationId) return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(`${HIDDEN_KEY_PREFIX}${simulationId}`) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveHiddenLiveEditUnitIds(simulationId: string | undefined, ids: string[]) {
  if (!simulationId) return;
  try {
    window.localStorage.setItem(`${HIDDEN_KEY_PREFIX}${simulationId}`, JSON.stringify(ids));
  } catch {
    // Keep the current editor usable if browser storage is unavailable.
  }
}

export type LiveEditObjects = { objectives: DeploymentObjective[]; tacticalGraphics: TacticalGraphic[] };

export function loadLiveEditObjects(simulationId?: string): LiveEditObjects {
  if (!simulationId) return { objectives: [], tacticalGraphics: [] };
  try {
    const stored = JSON.parse(window.localStorage.getItem(`${OBJECT_KEY_PREFIX}${simulationId}`) ?? '{}') as Partial<LiveEditObjects>;
    return {
      objectives: Array.isArray(stored.objectives) ? stored.objectives.filter(item => item && typeof item.id === 'string' && item.position) : [],
      tacticalGraphics: Array.isArray(stored.tacticalGraphics) ? stored.tacticalGraphics.filter(item => item && typeof item.id === 'string' && item.geometry) : [],
    };
  } catch {
    return { objectives: [], tacticalGraphics: [] };
  }
}

export function saveLiveEditObjects(simulationId: string | undefined, objects: LiveEditObjects) {
  if (!simulationId) return;
  try {
    window.localStorage.setItem(`${OBJECT_KEY_PREFIX}${simulationId}`, JSON.stringify(objects));
  } catch {
    // Keep the current editor usable if browser storage is unavailable.
  }
}
