import data from '../data/tacticalTasks.json';
import type { DeploymentAffiliation, TacticalGraphic } from '../../../types';

export type TacticalTaskDefinition = {
  id: string; sidc: string; standard: string; label: string; korean: string;
  minPoints: number; maxPoints: number; drawRule: number;
  samplePoints: number[][]; preview: GeoJSON.Feature[];
};
export const tacticalTasks = data as unknown as TacticalTaskDefinition[];
export const getTacticalTask = (id?: string) => tacticalTasks.find(task => task.id === id);
export const taskLabel = (task: TacticalTaskDefinition) => `${task.label} (${task.korean})`;
export function taskSidc(task: TacticalTaskDefinition, affiliation: DeploymentAffiliation) {
  return task.sidc.slice(0, 3) + (affiliation === 'enemy' ? '6' : '3') + task.sidc.slice(4);
}
export function validateTaskPoints(task: TacticalTaskDefinition, points: number[][]) {
  if (points.length < task.minPoints || points.length > task.maxPoints) {
    throw new Error(`${taskLabel(task)}: 기준점 ${task.minPoints === task.maxPoints ? task.minPoints : `${task.minPoints}–${task.maxPoints}`}개가 필요합니다.`);
  }
  if (points.some(p => p.length !== 2 || !p.every(Number.isFinite)) || new Set(points.map(p => p.join(','))).size !== points.length) {
    throw new Error('기준점은 서로 다른 유효한 위치에 찍어 주세요.');
  }
}
export function createTaskGraphic(task: TacticalTaskDefinition, affiliation: DeploymentAffiliation, points: [number, number][]): TacticalGraphic {
  validateTaskPoints(task, points);
  return {
    id: `graphic-${crypto.randomUUID()}`, type: 'mil-task', name: task.label,
    tacticalSymbol: { definitionId: task.id, sidc: taskSidc(task, affiliation), affiliation },
    geometry: { type: 'LineString', coordinates: points },
  };
}
