import type {
  AtomicActionEffect,
  DeploymentUnit,
  SimulationResult,
  UnitAgentReport,
  UnitAgentState,
  UnitExecutionMode,
  UnitInitialState,
  UnitReadinessState,
} from '../../../types';

type MutableUnitState = Omit<UnitAgentState, 'commandState' | 'executionMode' | 'readinessState' | 'currentOrder' | 'canMove' | 'canFire' | 'canObserve' | 'reports'>;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const FIRE_ACTIONS = new Set(['disrupt', 'engage', 'fight', 'continue to engage', 'ambush', 'contain']);
const actionCache = new WeakMap<SimulationResult, Map<string, AtomicActionEffect[]>>();
const timelineCache = new WeakMap<SimulationResult, Map<string, AgentTimeline>>();

type AgentTimeline = {
  effects: AtomicActionEffect[];
  initial: MutableUnitState;
  startStates: MutableUnitState[];
  completedStates: MutableUnitState[];
  allowed: boolean[];
  blockedIndex?: number;
  reports: UnitAgentReport[];
};

function effectsForUnit(result: SimulationResult, unitId: string) {
  let byUnit = actionCache.get(result);
  if (!byUnit) {
    byUnit = new Map<string, AtomicActionEffect[]>();
    for (const effect of result.actionEffects ?? []) {
      const effects = byUnit.get(effect.unitId) ?? [];
      effects.push(effect);
      byUnit.set(effect.unitId, effects);
    }
    for (const effects of byUnit.values()) effects.sort((a, b) => a.startTime - b.startTime || a.actionSequence - b.actionSequence);
    actionCache.set(result, byUnit);
  }
  return byUnit.get(unitId) ?? [];
}

function executionMode(action: string): UnitExecutionMode {
  if (action === 'Move' || action === 'Withdraw') return 'MOVE';
  if (action === 'Observe') return 'OBSERVE';
  if (FIRE_ACTIONS.has(action.toLowerCase())) return 'FIRE';
  return 'TASK';
}

function initialState(initial?: UnitInitialState): MutableUnitState {
  const combatPowerPct = clampPercent(initial?.combatPowerPct ?? 100);
  return {
    combatPowerPct,
    damagePct: clampPercent(100 - combatPowerPct),
    ammunitionPct: clampPercent(initial?.ammunitionPct ?? 100),
    mobilityPct: clampPercent(initial?.mobilityPct ?? 100),
    fatiguePct: clampPercent(initial?.fatiguePct ?? 0),
    suppressionPct: clampPercent(initial?.suppressionPct ?? 0),
  };
}

function applyActionCost(state: MutableUnitState, effect: AtomicActionEffect, progress: number) {
  const duration = Math.max(0.1, effect.endTime - effect.startTime);
  const scale = duration * progress;
  const action = effect.action.toLowerCase();
  if (executionMode(effect.action) === 'MOVE') {
    state.fatiguePct = clampPercent(state.fatiguePct + 2.5 * scale);
    state.mobilityPct = clampPercent(state.mobilityPct - 0.25 * scale);
    return;
  }
  if (executionMode(effect.action) === 'FIRE') {
    const ammunitionRate = action === 'fight' ? 8 : action === 'engage' || action === 'continue to engage' ? 7 : 5;
    state.ammunitionPct = clampPercent(state.ammunitionPct - ammunitionRate * scale);
    state.fatiguePct = clampPercent(state.fatiguePct + 1.5 * scale);
    state.suppressionPct = clampPercent(state.suppressionPct + 0.5 * scale);
    return;
  }
  if (executionMode(effect.action) === 'OBSERVE') {
    state.fatiguePct = clampPercent(state.fatiguePct + 0.5 * scale);
    return;
  }
  state.fatiguePct = clampPercent(state.fatiguePct + 0.25 * scale);
}

function guards(state: MutableUnitState) {
  return {
    canMove: state.mobilityPct > 10 && state.fatiguePct < 90 && state.combatPowerPct > 15,
    canFire: state.ammunitionPct > 5 && state.suppressionPct < 85 && state.combatPowerPct > 15,
    canObserve: state.fatiguePct < 95 && state.combatPowerPct > 10,
  };
}

function readiness(state: MutableUnitState): UnitReadinessState {
  if (state.combatPowerPct <= 15 || state.mobilityPct <= 10) return 'COMBAT_INEFFECTIVE';
  if (state.ammunitionPct <= 10 || state.combatPowerPct <= 40 || state.fatiguePct >= 85 || state.suppressionPct >= 80) return 'CRITICAL';
  if (state.ammunitionPct <= 30 || state.combatPowerPct <= 70 || state.fatiguePct >= 60 || state.suppressionPct >= 50) return 'DEGRADED';
  return 'EFFECTIVE';
}

function targetLabel(effect: AtomicActionEffect) {
  const target = effect.parameters.target ?? effect.parameters.destination ?? effect.parameters.result;
  return typeof target === 'string' ? ` · ${target}` : '';
}

function targetId(effect: AtomicActionEffect) {
  const target = effect.parameters.target ?? effect.parameters.destination ?? effect.parameters.result;
  return typeof target === 'string' ? target : undefined;
}

function reportState(state: MutableUnitState, commandState: UnitAgentState['commandState']): UnitAgentReport['state'] {
  return {
    commandState,
    readinessState: readiness(state),
    combatPowerPct: state.combatPowerPct,
    ammunitionPct: state.ammunitionPct,
    mobilityPct: state.mobilityPct,
    fatiguePct: state.fatiguePct,
    suppressionPct: state.suppressionPct,
  };
}

function createReport(
  unitId: string,
  time: number,
  type: UnitAgentReport['type'],
  severity: UnitAgentReport['severity'],
  message: string,
  state: MutableUnitState,
  commandState: UnitAgentState['commandState'],
  effect?: AtomicActionEffect,
  reason?: string,
): UnitAgentReport {
  return {
    id: `${unitId}:${type}:${effect?.actionSequence ?? 'agent'}:${time}`,
    time,
    unitId,
    recipient: 'ai-commander',
    type,
    severity,
    action: effect?.action,
    target: effect ? targetId(effect) : undefined,
    reason,
    state: reportState(state, commandState),
    message,
  };
}

function guardFailure(state: MutableUnitState, effect: AtomicActionEffect) {
  const mode = executionMode(effect.action);
  if (mode === 'MOVE') {
    if (state.mobilityPct <= 10) return 'mobilityPct <= 10';
    if (state.fatiguePct >= 90) return 'fatiguePct >= 90';
    return 'combatPowerPct <= 15';
  }
  if (mode === 'FIRE') {
    if (state.ammunitionPct <= 5) return 'ammunitionPct <= 5';
    if (state.suppressionPct >= 85) return 'suppressionPct >= 85';
    return 'combatPowerPct <= 15';
  }
  return mode === 'OBSERVE' && state.fatiguePct >= 95 ? 'fatiguePct >= 95' : 'combatPowerPct <= 10';
}

function ammunitionThresholdReports(
  unitId: string,
  effect: AtomicActionEffect,
  before: MutableUnitState,
  after: MutableUnitState,
): UnitAgentReport[] {
  return [30, 10, 5].flatMap((threshold) => (
    before.ammunitionPct > threshold && after.ammunitionPct <= threshold
      ? [createReport(
        unitId,
        effect.endTime,
        'AMMUNITION_THRESHOLD',
        threshold <= 10 ? 'critical' : 'warning',
        `Ammunition threshold crossed: ${threshold}% remaining.`,
        after,
        'READY',
        effect,
        `ammunitionPct <= ${threshold}`,
      )]
      : []
  ));
}

function cloneState(state: MutableUnitState): MutableUnitState {
  return { ...state };
}

function actionAllowed(state: MutableUnitState, effect: AtomicActionEffect) {
  const mode = executionMode(effect.action);
  const available = guards(state);
  return mode === 'MOVE' ? available.canMove : mode === 'FIRE' ? available.canFire : mode === 'OBSERVE' ? available.canObserve : true;
}

function initialStateKey(unitId: string, initial?: UnitInitialState) {
  return `${unitId}:${initial?.combatPowerPct ?? 100}:${initial?.ammunitionPct ?? 100}:${initial?.mobilityPct ?? 100}:${initial?.fatiguePct ?? 0}:${initial?.suppressionPct ?? 0}`;
}

/** Compiles full-action checkpoints once; playback only applies the active action's partial delta. */
function timelineForUnit(result: SimulationResult, deploymentUnit: DeploymentUnit | undefined, unitId: string): AgentTimeline {
  const key = initialStateKey(unitId, deploymentUnit?.initialState);
  let byUnit = timelineCache.get(result);
  if (!byUnit) {
    byUnit = new Map<string, AgentTimeline>();
    timelineCache.set(result, byUnit);
  }
  const cached = byUnit.get(key);
  if (cached) return cached;

  const effects = effectsForUnit(result, unitId);
  const initial = initialState(deploymentUnit?.initialState);
  const state = cloneState(initial);
  const startStates: MutableUnitState[] = [];
  const completedStates: MutableUnitState[] = [];
  const allowed: boolean[] = [];
  const reports: UnitAgentReport[] = [createReport(
    unitId,
    result.startTime,
    'AGENT_INITIALIZED',
    'info',
    'Agent initialized in READY state.',
    state,
    'READY',
  )];
  let blockedIndex: number | undefined;

  effects.forEach((effect, index) => {
    startStates.push(cloneState(state));
    const permitted = blockedIndex === undefined && actionAllowed(state, effect);
    allowed.push(permitted);
    if (permitted) {
      reports.push(createReport(
        unitId,
        effect.startTime,
        'COMMAND_ACCEPTED',
        'info',
        `Command accepted: ${effect.action}${targetLabel(effect)}.`,
        state,
        'EXECUTING',
        effect,
      ));
      reports.push(createReport(
        unitId,
        effect.startTime,
        'EXECUTION_STARTED',
        'info',
        `Execution started: ${effect.action}${targetLabel(effect)}.`,
        state,
        'EXECUTING',
        effect,
      ));
      const readinessBefore = readiness(state);
      const before = cloneState(state);
      applyActionCost(state, effect, 1);
      reports.push(...ammunitionThresholdReports(unitId, effect, before, state));
      if (readinessBefore !== readiness(state)) {
        reports.push(createReport(
          unitId,
          effect.endTime,
          'READINESS_CHANGED',
          readiness(state) === 'CRITICAL' || readiness(state) === 'COMBAT_INEFFECTIVE' ? 'critical' : 'warning',
          `Readiness changed: ${readinessBefore} -> ${readiness(state)}.`,
          state,
          'READY',
          effect,
        ));
      }
      reports.push(createReport(
        unitId,
        effect.endTime,
        'EXECUTION_COMPLETED',
        'info',
        `Execution completed: ${effect.action}${targetLabel(effect)}.`,
        state,
        'READY',
        effect,
      ));
    } else if (blockedIndex === undefined) {
      blockedIndex = index;
      const reason = guardFailure(state, effect);
      reports.push(createReport(
        unitId,
        effect.startTime,
        'GUARD_BLOCKED',
        readiness(state) === 'CRITICAL' || readiness(state) === 'COMBAT_INEFFECTIVE' ? 'critical' : 'warning',
        `Command blocked: ${effect.action}${targetLabel(effect)}. Guard failed: ${reason}.`,
        state,
        'HOLD',
        effect,
        reason,
      ));
    }
    completedStates.push(cloneState(state));
  });

  reports.sort((first, second) => first.time - second.time);
  const timeline = { effects, initial, startStates, completedStates, allowed, blockedIndex, reports };
  byUnit.set(key, timeline);
  return timeline;
}

function firstEffectAfter(effects: AtomicActionEffect[], simulationTime: number) {
  let low = 0;
  let high = effects.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (effects[middle].startTime > simulationTime) high = middle;
    else low = middle + 1;
  }
  return low;
}

function reportsAtTime(timeline: AgentTimeline, simulationTime: number) {
  let low = 0;
  let high = timeline.reports.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (timeline.reports[middle].time <= simulationTime) low = middle + 1;
    else high = middle;
  }
  return timeline.reports.slice(Math.max(0, low - 8), low);
}

/** The Commander reads this immutable, time-ordered event log instead of unit display text. */
export function getCommanderReports(result: SimulationResult, deployment?: { units: DeploymentUnit[] }): UnitAgentReport[] {
  const deploymentById = new Map(deployment?.units.map(unit => [unit.id, unit]));
  const unitIds = new Set([
    ...(result.actionEffects ?? []).map(effect => effect.unitId),
    ...(deployment?.units ?? []).map(unit => unit.id),
  ]);
  return [...unitIds]
    .flatMap(unitId => timelineForUnit(result, deploymentById.get(unitId), unitId).reports)
    .sort((first, second) => first.time - second.time || first.id.localeCompare(second.id));
}

/**
 * Deterministic local unit-agent state derived from the shared simulation clock.
 * Damage is intentionally not generated here: it must arrive later from combat adjudication.
 */
export function getUnitAgentState(
  result: SimulationResult,
  deploymentUnit: DeploymentUnit | undefined,
  unitId: string,
  simulationTime: number,
): UnitAgentState {
  const timeline = timelineForUnit(result, deploymentUnit, unitId);
  const { effects } = timeline;
  const nextEffectIndex = firstEffectAfter(effects, simulationTime);
  const candidateIndex = nextEffectIndex - 1;
  const blockedEffect = timeline.blockedIndex !== undefined && simulationTime >= effects[timeline.blockedIndex].startTime
    ? effects[timeline.blockedIndex]
    : undefined;
  const activeEffect = !blockedEffect && candidateIndex >= 0 && timeline.allowed[candidateIndex] && simulationTime < effects[candidateIndex].endTime
    ? effects[candidateIndex]
    : undefined;
  let state: MutableUnitState;

  if (blockedEffect) {
    state = cloneState(timeline.startStates[timeline.blockedIndex!]);
  } else if (activeEffect) {
    state = cloneState(timeline.startStates[candidateIndex]);
    const progress = Math.max(0, (simulationTime - activeEffect.startTime) / Math.max(0.1, activeEffect.endTime - activeEffect.startTime));
    applyActionCost(state, activeEffect, progress);
  } else if (nextEffectIndex < effects.length) {
    state = cloneState(timeline.startStates[nextEffectIndex]);
  } else if (timeline.completedStates.length > 0) {
    state = cloneState(timeline.completedStates.at(-1)!);
  } else {
    state = cloneState(timeline.initial);
  }

  const statusGuards = guards(state);
  const commandState = blockedEffect ? 'HOLD' : activeEffect ? 'EXECUTING' : simulationTime >= result.endTime ? 'STOPPED' : 'READY';
  const currentOrder = blockedEffect
    ? `${blockedEffect.action}${targetLabel(blockedEffect)} · guard blocked`
    : activeEffect
      ? `${activeEffect.action}${targetLabel(activeEffect)}`
      : nextEffectIndex < effects.length
        ? `Next: ${effects[nextEffectIndex].action}${targetLabel(effects[nextEffectIndex])} `
        : commandState === 'STOPPED' ? 'No further command' : 'Awaiting command';

  return {
    ...state,
    commandState,
    executionMode: activeEffect ? executionMode(activeEffect.action) : null,
    readinessState: readiness(state),
    currentOrder: currentOrder.trim(),
    ...statusGuards,
    reports: reportsAtTime(timeline, simulationTime),
  };
}
