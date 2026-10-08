import { createUuid } from './uuid';
import type {
  DeploymentObjective,
  DeploymentSetup,
  DeploymentUnit,
  SimulationResult,
  TacticalGraphic,
  UnitAgentState,
} from '../../../types';
import { getUnitPositionAtTime, isUnitEliminated } from './playback';
import { createGeoPosition, getLngLat } from './position';

export type ReplanSnapshot = DeploymentSetup & {
  replan: {
    sourceSimulationId?: string;
    simulationTime: number;
    savedAt: string;
    voiceTranscript: string;
    unitStates: Record<string, UnitAgentState>;
    changes: {
      unitsAdded: number;
      unitsModified: number;
      unitsRemoved: number;
      objectives: number;
      tacticalGraphics: number;
      total: number;
    };
  };
};

type BuildReplanSnapshotOptions = {
  simulationId?: string;
  simulationTime: number;
  deployment: DeploymentSetup;
  result: SimulationResult;
  liveUnits: DeploymentUnit[];
  hiddenBaseUnitIds: string[];
  liveObjectives: DeploymentObjective[];
  liveTacticalGraphics: TacticalGraphic[];
  getUnitState: (unitId: string, simulationTime: number) => UnitAgentState | undefined;
  voiceTranscript?: string;
  now?: Date;
};

function mergeById<T extends { id: string }>(base: T[], overrides: T[]) {
  const merged = new Map(base.map(item => [item.id, item]));
  overrides.forEach(item => merged.set(item.id, item));
  return [...merged.values()];
}

function stateAsInitialState(state: UnitAgentState | undefined, fallback: DeploymentUnit['initialState']) {
  if (!state) return fallback;
  return {
    combatPowerPct: state.combatPowerPct,
    ammunitionPct: state.ammunitionPct,
    mobilityPct: state.mobilityPct,
    fatiguePct: state.fatiguePct,
    suppressionPct: state.suppressionPct,
  };
}

export function buildReplanSnapshot(options: BuildReplanSnapshotOptions): ReplanSnapshot {
  const {
    simulationId, simulationTime, deployment, result, liveUnits, hiddenBaseUnitIds,
    liveObjectives, liveTacticalGraphics, getUnitState,
  } = options;
  const savedAt = (options.now ?? new Date()).toISOString();
  const hiddenIds = new Set(hiddenBaseUnitIds);
  const liveUnitIds = new Set(liveUnits.map(unit => unit.id));
  const baseUnitIds = new Set(deployment.units.map(unit => unit.id));
  const unitStates: Record<string, UnitAgentState> = {};

  const baseUnits = deployment.units.flatMap(unit => {
    if (hiddenIds.has(unit.id) || liveUnitIds.has(unit.id) || isUnitEliminated(result, unit.id, simulationTime)) return [];
    const position = getUnitPositionAtTime(unit.id, simulationTime, result, deployment);
    const state = getUnitState(unit.id, simulationTime);
    if (state) unitStates[unit.id] = state;
    return [{
      ...unit,
      position: position ? createGeoPosition(position.longitude, position.latitude) : unit.position,
      initialState: stateAsInitialState(state, unit.initialState),
    }];
  });

  const editedUnits = liveUnits.filter(unit => !hiddenIds.has(unit.id)).map(unit => {
    const state = getUnitState(unit.id, simulationTime);
    if (state) unitStates[unit.id] = state;
    const [longitude, latitude] = getLngLat(unit.position);
    return {
      ...unit,
      position: createGeoPosition(longitude, latitude),
      initialState: stateAsInitialState(state, unit.initialState),
    };
  });
  const units = [...baseUnits, ...editedUnits];
  const currentPositionByUnitId = new Map(units.map(unit => [unit.id, getLngLat(unit.position)]));

  const tacticalGraphics = mergeById(deployment.tacticalGraphics, liveTacticalGraphics).map(graphic => {
    if (graphic.type !== 'axis' || !graphic.sourceUnitId || graphic.geometry.type !== 'LineString') return graphic;
    const source = currentPositionByUnitId.get(graphic.sourceUnitId);
    return source && graphic.geometry.coordinates.length >= 2
      ? { ...graphic, geometry: { ...graphic.geometry, coordinates: [source, ...graphic.geometry.coordinates.slice(1)] } }
      : graphic;
  });
  const changes = {
    unitsAdded: liveUnits.filter(unit => !baseUnitIds.has(unit.id)).length,
    unitsModified: liveUnits.filter(unit => baseUnitIds.has(unit.id) && !hiddenIds.has(unit.id)).length,
    unitsRemoved: hiddenIds.size,
    objectives: liveObjectives.length,
    tacticalGraphics: liveTacticalGraphics.length,
    total: 0,
  };
  changes.total = changes.unitsAdded + changes.unitsModified + changes.unitsRemoved + changes.objectives + changes.tacticalGraphics;

  return {
    ...deployment,
    id: `replan-${Date.now()}-${createUuid()}`,
    name: `${deployment.name} · REPLAN`,
    units,
    objectives: mergeById(deployment.objectives, liveObjectives),
    tacticalGraphics,
    createdAt: savedAt,
    updatedAt: savedAt,
    replan: { sourceSimulationId: simulationId, simulationTime, savedAt, voiceTranscript: options.voiceTranscript?.trim() ?? '', unitStates, changes },
  };
}
