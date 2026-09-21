import type { DeploymentSetup, SimulationResultPosition } from '../../../types';

/**
 * Explicit bridge between TFD planning references and the Alpha deployment.
 * Values not present in localStorage are deliberate map reference points, so
 * a planning effect never has to invent a position at render time.
 */
const ALPHA_PLAN_REFERENCES: Record<string, SimulationResultPosition> = {
  'enemy-artillery-pop': { longitude: 126.7242, latitude: 37.6301 },
  'pop-defensive-system': { longitude: 126.7194, latitude: 37.6265 },
  'north-screen-line': { longitude: 126.7162, latitude: 37.6320 },
  'north-zone': { longitude: 126.7177, latitude: 37.6319 },
  'reserve-west-green': { longitude: 126.7190, latitude: 37.6204 },
  'enemy-tank-bn-west-town': { longitude: 126.7184, latitude: 37.6238 },
  'reserve-status': { longitude: 126.7061, latitude: 37.6197 },
  'enemy-tank-reg-east-town': { longitude: 126.7244, latitude: 37.6218 },
  'uncommitted-enemy-forces': { longitude: 126.7271, latitude: 37.6275 },
  'pl-amber': { longitude: 126.7153, latitude: 37.6221 },
  'pl-amber-west': { longitude: 126.7149, latitude: 37.6254 },
  'pl-amber-east': { longitude: 126.7164, latitude: 37.6253 },
  passage: { longitude: 126.7153, latitude: 37.6213 },
  'obj-slam-area': { longitude: 126.7213, latitude: 37.6251 },
  'main-follow-pos': { longitude: 126.7210, latitude: 37.6239 },
  'obj-slam': { longitude: 126.7218, latitude: 37.6250 },
  'c-tcf-ready': { longitude: 126.7033, latitude: 37.6201 },
  'c-cav-screening': { longitude: 126.7155, latitude: 37.6324 },
  'c-deep-ops-reported': { longitude: 126.7127, latitude: 37.6254 },
  'c-fires-reported': { longitude: 126.7097, latitude: 37.6272 },
  'c-north-reported': { longitude: 126.7177, latitude: 37.6319 },
  'c-south-reported': { longitude: 126.7180, latitude: 37.6213 },
  'c-reserve-reported': { longitude: 126.7210, latitude: 37.6239 },
  'c-main-reported': { longitude: 126.7218, latitude: 37.6250 },
};

function centerOfGraphic(deployment: DeploymentSetup, reference: string): SimulationResultPosition | undefined {
  const graphic = deployment.tacticalGraphics.find((candidate) => candidate.name === reference);
  if (!graphic) return undefined;
  const coordinates = graphic.geometry.type === 'LineString' ? graphic.geometry.coordinates : graphic.geometry.coordinates[0] ?? [];
  if (coordinates.length === 0) return undefined;
  const sum = coordinates.reduce((current, coordinate) => ({ longitude: current.longitude + coordinate[0], latitude: current.latitude + coordinate[1] }), { longitude: 0, latitude: 0 });
  return { longitude: sum.longitude / coordinates.length, latitude: sum.latitude / coordinates.length };
}

export function resolvePlanReference(deployment: DeploymentSetup | undefined, reference: string): SimulationResultPosition | undefined {
  const unit = deployment?.units.find((candidate) => candidate.id === reference || candidate.designation === reference);
  const longitude = unit?.position.longitude ?? unit?.position.lon;
  const latitude = unit?.position.latitude ?? unit?.position.lat;
  if (typeof longitude === 'number' && typeof latitude === 'number') return { longitude, latitude };
  if (deployment) {
    const objective = deployment.objectives.find((candidate) => candidate.id === reference || candidate.name === reference);
    const objectiveLongitude = objective?.position.longitude ?? objective?.position.lon;
    const objectiveLatitude = objective?.position.latitude ?? objective?.position.lat;
    if (typeof objectiveLongitude === 'number' && typeof objectiveLatitude === 'number') {
      return { longitude: objectiveLongitude, latitude: objectiveLatitude };
    }
    const graphicCenter = centerOfGraphic(deployment, reference);
    if (graphicCenter) return graphicCenter;
  }
  return ALPHA_PLAN_REFERENCES[reference];
}
