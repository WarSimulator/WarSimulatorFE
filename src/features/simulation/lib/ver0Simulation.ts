import { actions } from '@atlas/atomic-actions';
import type {
  DeploymentSetup,
  DeploymentUnit,
  SimulationResult,
  SimulationResultPosition,
  SimulationTrackSegment,
  SimulationUnit,
  TacticalGraphic,
} from '../../../types';
import { getLngLat } from './position';
import { getTacticalTask, taskLabel } from './tacticalTasks';

export type Ver0CommandKind = 'draw' | 'tactical-task' | 'action';

export type Ver0Command = {
  id: string;
  unitId: string;
  kind: Ver0CommandKind;
  graphicId?: string;
  actionId?: string;
  startTime: number;
  endTime: number;
  from: SimulationResultPosition;
  to: SimulationResultPosition;
  note?: string;
};

export const ver0Actions = actions.map(action => ({ id: action.id, name: action.name, ko: action.ko }));

function samePoint(first: SimulationResultPosition, second: SimulationResultPosition) {
  return Math.abs(first.longitude - second.longitude) < 1e-9 && Math.abs(first.latitude - second.latitude) < 1e-9;
}

function asPosition(point: number[]): SimulationResultPosition {
  return { longitude: point[0], latitude: point[1] };
}

export function graphicPoints(graphic?: TacticalGraphic): SimulationResultPosition[] {
  if (!graphic) return [];
  const coordinates = graphic.geometry.type === 'Polygon'
    ? graphic.geometry.coordinates[0].slice(0, -1)
    : graphic.geometry.coordinates;
  return coordinates.map(asPosition);
}

export function suggestedCommandEndpoints(unit: DeploymentUnit, graphic?: TacticalGraphic) {
  const [longitude, latitude] = getLngLat(unit.position);
  const points = graphicPoints(graphic);
  return {
    from: { longitude, latitude },
    to: points.at(-1) ?? { longitude, latitude },
  };
}

function distance(first: SimulationResultPosition, second: SimulationResultPosition) {
  const meanLatitude = (first.latitude + second.latitude) * Math.PI / 360;
  const dx = (second.longitude - first.longitude) * 111_000 * Math.cos(meanLatitude);
  const dy = (second.latitude - first.latitude) * 111_000;
  return Math.hypot(dx, dy);
}

function commandPath(command: Ver0Command, graphic?: TacticalGraphic) {
  const path = [command.from, ...graphicPoints(graphic), command.to]
    .filter((point, index, all) => index === 0 || !samePoint(point, all[index - 1]));
  return path.length === 1 ? [path[0], path[0]] : path;
}

function commandName(command: Ver0Command, graphic?: TacticalGraphic) {
  if (command.kind === 'action') return ver0Actions.find(action => action.id === command.actionId)?.name ?? 'Move';
  if (command.kind === 'tactical-task') {
    const task = getTacticalTask(graphic?.tacticalSymbol?.definitionId);
    return task ? taskLabel(task) : graphic?.name ?? '전술 과업';
  }
  return 'Move';
}

function commandVisualizationId(command: Ver0Command) {
  return command.kind === 'action' ? command.actionId ?? 'move' : 'move';
}

function segmentForCommand(command: Ver0Command, sequence: number, graphic?: TacticalGraphic): SimulationTrackSegment {
  const path = commandPath(command, graphic);
  const distances = path.slice(1).map((point, index) => distance(path[index], point));
  const total = distances.reduce((sum, value) => sum + value, 0);
  let elapsed = 0;
  const duration = Math.max(0.1, command.endTime - command.startTime);
  const keyframes = path.map((position, index) => {
    if (index > 0) elapsed += distances[index - 1];
    const progress = total > 0 ? elapsed / total : index / Math.max(1, path.length - 1);
    return { time: command.startTime + duration * progress, position };
  });
  return {
    actionSequence: sequence,
    action: commandName(command, graphic),
    startTime: command.startTime,
    endTime: command.endTime,
    source: `${command.from.longitude},${command.from.latitude}`,
    destination: `${command.to.longitude},${command.to.latitude}`,
    keyframes,
  };
}

export function validateVer0Commands(deployment: DeploymentSetup, commands: Ver0Command[]) {
  if (!deployment.units.length) return '유닛을 1개 이상 배치해 주세요.';
  if (!commands.length) return '유닛에 DRAW, 전술과업 또는 ACTION을 1개 이상 할당해 주세요.';
  for (const command of commands) {
    if (!deployment.units.some(unit => unit.id === command.unitId)) return '삭제된 유닛에 할당된 명령이 있습니다.';
    if (command.endTime <= command.startTime) return '명령 종료 시각은 시작 시각보다 늦어야 합니다.';
    if (command.kind !== 'action' && !deployment.tacticalGraphics.some(graphic => graphic.id === command.graphicId)) {
      return '삭제된 DRAW/전술과업에 할당된 명령이 있습니다.';
    }
  }
  for (const unit of deployment.units) {
    const ordered = commands.filter(command => command.unitId === unit.id).sort((first, second) => first.startTime - second.startTime);
    if (ordered.some((command, index) => index > 0 && command.startTime < ordered[index - 1].endTime)) {
      return `${unit.designation}: 명령 시간이 서로 겹칩니다.`;
    }
  }
  return '';
}

export function buildVer0Simulation(deployment: DeploymentSetup, commands: Ver0Command[]): { result: SimulationResult; units: SimulationUnit[] } {
  const graphicById = new Map(deployment.tacticalGraphics.map(graphic => [graphic.id, graphic]));
  const ordered = [...commands].sort((first, second) => first.startTime - second.startTime || first.endTime - second.endTime);
  const endTime = Math.max(60, ...ordered.map(command => command.endTime));
  let sequence = 1;
  const segmentsByCommand = new Map<string, SimulationTrackSegment>();
  const unitTracks = deployment.units.map(unit => {
    const [longitude, latitude] = getLngLat(unit.position);
    const unitCommands = ordered.filter(command => command.unitId === unit.id);
    const segments: SimulationTrackSegment[] = [];
    let cursorTime = 0;
    let cursorPosition = { longitude, latitude };
    for (const command of unitCommands) {
      if (command.startTime > cursorTime) {
        segments.push({
          actionSequence: sequence++, action: 'Hold', startTime: cursorTime, endTime: command.startTime,
          source: unit.designation, destination: unit.designation,
          keyframes: [{ time: cursorTime, position: cursorPosition }, { time: command.startTime, position: cursorPosition }],
        });
      }
      const segment = segmentForCommand(command, sequence++, graphicById.get(command.graphicId ?? ''));
      segmentsByCommand.set(command.id, segment);
      segments.push(segment);
      cursorTime = command.endTime;
      cursorPosition = command.to;
    }
    if (!segments.length) {
      segments.push({
        actionSequence: sequence++, action: 'Hold', startTime: 0, endTime,
        source: unit.designation, destination: unit.designation,
        keyframes: [{ time: 0, position: { longitude, latitude } }, { time: endTime, position: { longitude, latitude } }],
      });
    }
    return { unitId: unit.id, actor: unit.designation, startTime: 0, endTime, segments };
  });

  const actionEffects = ordered.map((command, index) => {
    const unit = deployment.units.find(candidate => candidate.id === command.unitId)!;
    const segment = segmentsByCommand.get(command.id)!;
    const action = commandName(command, graphicById.get(command.graphicId ?? ''));
    return {
      actionSequence: index + 1,
      action,
      visualizationId: commandVisualizationId(command),
      unitId: command.unitId,
      actor: unit.designation,
      startTime: command.startTime,
      endTime: command.endTime,
      origin: command.from,
      parameters: { destination: command.to, note: command.note ?? '', graphicId: command.graphicId ?? '' },
      phases: [commandVisualizationId(command)],
      executionMode: 'visualization_only' as const,
      outcome: 'not_adjudicated' as const,
      renderData: { movement: segment },
    };
  });
  const events = actionEffects.flatMap(effect => [
    { time: effect.startTime, type: 'ACTION_STARTED', actionSequence: effect.actionSequence, actor: effect.actor, action: effect.action },
    { time: effect.endTime, type: 'ACTION_COMPLETED', actionSequence: effect.actionSequence, actor: effect.actor, action: effect.action },
  ]).sort((first, second) => first.time - second.time);

  const result: SimulationResult = {
    schemaVersion: '1.0', planIndex: 0, deploymentId: deployment.id,
    startTime: 0, endTime, unitTracks, actionEffects, events,
  };
  const units: SimulationUnit[] = deployment.units.map(unit => {
    const firstCommand = ordered.find(command => command.unitId === unit.id);
    return {
      id: unit.id, name: unit.designation,
      allegiance: unit.affiliation === 'enemy' ? 'Enemy' : 'Friendly',
      type: unit.unitType, status: 'READY', combatPower: unit.initialState?.combatPowerPct ?? 100,
      currentOrder: firstCommand ? commandName(firstCommand, graphicById.get(firstCommand.graphicId ?? '')) : 'Hold',
      personnel: '100%', ammunition: `${unit.initialState?.ammunitionPct ?? 100}%`, mobility: `${unit.initialState?.mobilityPct ?? 100}%`,
      position: { x: 0, y: 0 }, sidc: unit.sidc, symbolStandard: unit.symbolStandard,
      symbolScale: unit.symbolScale, symbolRotation: unit.symbolRotation,
      geographicPosition: { longitude: getLngLat(unit.position)[0], latitude: getLngLat(unit.position)[1] },
      icon: 'shield', log: [], timeline: [],
    };
  });
  return { result, units };
}
