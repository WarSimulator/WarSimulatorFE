import type { DeploymentSetup } from '../../../types';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './mapConfig';
import { createGeoPosition, getLngLat } from './position';
import { getUnitSidc } from './sidc';

const STORAGE_KEY = 'atlas-defense.deployment-setups';

function migrateDeployment(deployment: DeploymentSetup): DeploymentSetup {
  return {
    ...deployment,
    units: (deployment.units ?? []).map((unit) => {
      const [longitude, latitude] = getLngLat(unit.position ?? {});
      return {
        ...unit,
        sidc: getUnitSidc(unit),
        symbolScale: unit.symbolScale ?? 1,
        position: createGeoPosition(longitude, latitude),
      };
    }),
    objectives: (deployment.objectives ?? []).map((objective) => {
      const [longitude, latitude] = getLngLat(objective.position ?? {});
      return {
        ...objective,
        position: createGeoPosition(longitude, latitude),
      };
    }),
    tacticalGraphics: deployment.tacticalGraphics ?? [],
    mapView: deployment.mapView ?? {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
    },
  };
}

export function getAllDeployments(): DeploymentSetup[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    return (JSON.parse(stored) as DeploymentSetup[]).map(migrateDeployment);
  } catch {
    return [];
  }
}

export function getDeploymentById(id: string): DeploymentSetup | undefined {
  return getAllDeployments().find((deployment) => deployment.id === id);
}

export function saveDeployment(deployment: DeploymentSetup) {
  const deployments = getAllDeployments();
  const exists = deployments.some((item) => item.id === deployment.id);
  const nextDeployments = exists
    ? deployments.map((item) => (item.id === deployment.id ? deployment : item))
    : [...deployments, deployment];

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDeployments));
}

export function replaceDeployments(deployments: DeploymentSetup[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deployments.map(migrateDeployment)));
}

export function removeDeployment(id: string) {
  const deployments = getAllDeployments().filter((deployment) => deployment.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deployments));
}

export function createDeploymentDraft(mettTcDocumentId: string): DeploymentSetup {
  const now = new Date().toISOString();

  return {
    id: `deployment-${Date.now()}`,
    name: 'Alpha Deployment',
    mettTcDocumentId,
    units: [],
    objectives: [],
    tacticalGraphics: [],
    mapView: {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyDeployment(mettTcDocumentId: string, name: string): DeploymentSetup {
  const now = new Date().toISOString();

  return {
    id: `deployment-${Date.now()}-${crypto.randomUUID()}`,
    name,
    mettTcDocumentId,
    units: [],
    objectives: [],
    tacticalGraphics: [],
    mapView: {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateDeployment(deployment: DeploymentSetup, name: string): DeploymentSetup {
  const now = new Date().toISOString();
  const clone = cloneDeployment(deployment);

  return {
    ...clone,
    id: `deployment-${Date.now()}-${crypto.randomUUID()}`,
    name,
    units: clone.units.map((unit) => ({ ...unit, id: `unit-${crypto.randomUUID()}` })),
    objectives: clone.objectives.map((objective) => ({ ...objective, id: `objective-${crypto.randomUUID()}` })),
    tacticalGraphics: clone.tacticalGraphics.map((graphic) => ({ ...graphic, id: `graphic-${crypto.randomUUID()}` })),
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneDeployment(deployment: DeploymentSetup): DeploymentSetup {
  return JSON.parse(JSON.stringify(deployment)) as DeploymentSetup;
}
