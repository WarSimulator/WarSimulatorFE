/** Read the fixed Planning export without changing its scheduling or inventing bindings. */
export type ForceSide = 'BLUE' | 'RED';
type JsonObject = Record<string, unknown>;

export type PlanIssue = { code: string; message: string; actionId?: string };

export type ImportedStep = {
  sequence?: number;
  start?: number;
  duration?: number;
  end?: number;
  action?: string;
  action_key?: string;
  pddl_action?: string;
  actor_unit_id?: string;
  unit_id?: string;
  actor?: string;
  parameters?: unknown;
  planning?: {
    actionId: string;
    actionKey: string;
    actorRef: string;
    actorKey: string;
    forceSide: ForceSide;
    lane: string;
    sourceTaskId?: string;
    task: unknown;
    timelineTask: unknown;
    sourceTask?: JsonObject;
    dependsOn: string[];
    conditional: boolean;
    condition?: string;
    mapPreconditions: unknown;
    goalEffects: unknown;
  };
};

export type ParsedForcePlan = {
  forceSide: ForceSide;
  format: 'planning' | 'legacy';
  steps: ImportedStep[];
  issues: PlanIssue[];
  context: {
    roleBindings: JsonObject[];
    identityCatalog: JsonObject;
    roles: JsonObject;
  };
};

export class ForcePlanError extends Error {
  constructor(public readonly issues: PlanIssue[]) {
    super(issues.slice(0, 6).map(issue => issue.message).join('\n')
      + (issues.length > 6 ? `\n외 ${issues.length - 6}개 항목을 확인해야 합니다.` : ''));
    this.name = 'ForcePlanError';
  }
}

function fail(message: string): never {
  throw new ForcePlanError([{ code: 'INVALID_PLAN', message }]);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: JSON 객체가 필요합니다.`);
  return value as JsonObject;
}

function optionalObject(value: unknown): JsonObject {
  return value === undefined || value === null ? {} : object(value, '계획 필드');
}

function rows(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) fail(`${label}: 배열이 필요합니다.`);
  return value.map((row, index) => object(row, `${label}[${index}]`));
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}: 비어 있지 않은 문자열이 필요합니다.`);
  return value.trim();
}

function indexRows(items: JsonObject[], key: string, label: string) {
  const result = new Map<string, JsonObject>();
  for (const item of items) {
    const id = string(item[key], `${label}.${key}`);
    if (result.has(id)) fail(`${label}: 중복 ID '${id}'가 있습니다.`);
    result.set(id, item);
  }
  return result;
}

function dependencies(value: unknown, label: string) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label}: 배열이 필요합니다.`);
  return value.map(item => string(item, label));
}

export function normalizeActionKey(value: string) {
  const key = value.trim().toLowerCase().replace(/^aa-/, '').replace(/[\s-]+/g, '_');
  return ({ continue_engage: 'continue_to_engage', reorient: 're_orient' } as Record<string, string>)[key] ?? key;
}

function checkSide(value: unknown, side: ForceSide, label: string) {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || value.toUpperCase() !== side) fail(`${label}: ${side} 입력에 '${String(value)}' 진영이 지정되어 있습니다.`);
}

export function parseForcePlan(payload: unknown, side: ForceSide): ParsedForcePlan {
  const label = `${side}-Force Plan`;
  const root = object(payload, label);
  const temporal = optionalObject(root.temporal_plan);
  const candidate = optionalObject(root.candidate);
  const context = {
    roleBindings: rows(optionalObject(root.force_unit_accountability).execution_actor_bindings ?? [], `${label}.execution_actor_bindings`),
    identityCatalog: optionalObject(root.map_object_identity_catalog),
    roles: optionalObject(candidate.roles),
  };
  if (root.complete === false || temporal.complete === false) fail(`${label}: complete=false 계획입니다.`);
  checkSide(root.force_side, side, label);
  checkSide(root.force_perspective, side, label);
  // Perspective is explicit in own-force inventory, never inferred from mission_family.
  for (const entry of rows(root.own_force_unit_inventory ?? [], `${label}.own_force_unit_inventory`)) {
    checkSide(entry.force_side, side, label);
    checkSide(entry.force_perspective, side, label);
  }

  if (temporal.timeline === undefined) {
    const steps = rows(temporal.steps ?? root.actions ?? root.steps, `${label}.steps`);
    if (!steps.length) fail(`${label}: 실행 단계가 없습니다.`);
    return { forceSide: side, format: 'legacy', steps: steps.map(step => ({ ...step } as ImportedStep)), issues: [], context };
  }

  const timeline = object(temporal.timeline, `${label}.timeline`);
  const entries = rows(timeline.steps, `${label}.timeline.steps`);
  if (!entries.length) fail(`${label}: 실행 단계가 없습니다.`);
  const decomposition = object(root.generated_decomposition, `${label}.generated_decomposition`);
  const actions = indexRows(rows(decomposition.actions, `${label}.actions`), 'action_id', label);
  const tasks = indexRows(rows(candidate.tasks ?? [], `${label}.tasks`), 'task_id', label);
  const catalogUnits = indexRows(rows(context.identityCatalog.units ?? [], `${label}.catalog.units`), 'map_object_id', label);
  const timed = indexRows(entries, 'pddl_action', label);
  const actorNames = new Map<string, string>();
  for (const binding of context.roleBindings) {
    if (typeof binding.detected_unit_id === 'string' && typeof binding.internal_role_actor === 'string') {
      actorNames.set(binding.detected_unit_id, binding.internal_role_actor);
    }
  }
  if (timeline.step_count !== undefined && timeline.step_count !== entries.length) fail(`${label}: step_count가 실제 단계 수와 다릅니다.`);
  if (decomposition.action_count !== undefined && decomposition.action_count !== actions.size) fail(`${label}: action_count가 실제 행동 수와 다릅니다.`);
  // A completed replan may omit earlier actions; it may not silently omit unfinished ones.
  const completed = new Set(dependencies(temporal.completed_action_ids, `${label}.completed_action_ids`));
  for (const id of actions.keys()) if (!timed.has(id) && !completed.has(id)) fail(`${label}: '${id}'의 실행 시간이 없습니다.`);

  const issues: PlanIssue[] = [];
  for (const [id, task] of tasks) {
    for (const dep of dependencies(task.depends_on, `${label}/${id}.depends_on`)) {
      if (!tasks.has(dep)) issues.push({ code: 'MISSING_TASK_DEPENDENCY', message: `${label}: ${id}의 선행 임무 '${dep}'가 없습니다.` });
    }
  }

  const steps: ImportedStep[] = entries.map(step => {
    const id = string(step.pddl_action, `${label}.pddl_action`);
    const action = actions.get(id);
    if (!action) fail(`${label}: '${id}'의 행동 정의가 없습니다.`);
    const key = normalizeActionKey(string(action.canonical_action_key, `${label}/${id}.canonical_action_key`));
    if (normalizeActionKey(string(step.atomic_action, `${label}/${id}.atomic_action`)) !== key) fail(`${label}: '${id}'의 행동 종류가 시간표와 다릅니다.`);
    const actor = string(step.unit, `${label}/${id}.unit`);
    const executionActor = actorNames.get(actor) ?? actor;
    checkSide(catalogUnits.get(actor)?.force_side, side, `${label}/${id}`);
    checkSide(step.force_side, side, `${label}/${id}`);
    checkSide(action.force_side, side, `${label}/${id}`);
    if (action.unit !== actor) fail(`${label}: '${id}'의 행동 주체가 시간표와 다릅니다.`);
    const start = step.start;
    const duration = step.duration;
    const end = step.end;
    if (typeof start !== 'number' || !Number.isFinite(start) || start < 0
      || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0
      || typeof end !== 'number' || !Number.isFinite(end) || Math.abs(start + duration - end) > 1e-6) fail(`${label}: '${id}'의 시작·기간·종료 시간이 유효하지 않습니다.`);
    if (typeof action.duration === 'number' && Math.abs(action.duration - duration) > 1e-6) fail(`${label}: '${id}'의 기간이 행동 정의와 다릅니다.`);
    const sourceTaskId = typeof action.source_generated_task_id === 'string' ? action.source_generated_task_id : undefined;
    const task = sourceTaskId ? tasks.get(sourceTaskId) : undefined;
    if (sourceTaskId && !task) fail(`${label}: '${id}'의 원본 임무 '${sourceTaskId}'가 없습니다.`);
    const deps = dependencies(action.depends_on, `${label}/${id}.depends_on`);
    for (const dep of deps) {
      if (completed.has(dep)) continue;
      const prior = timed.get(dep);
      if (!prior || typeof prior.end !== 'number' || prior.end > start + 1e-6) fail(`${label}: '${id}'의 선행 행동 '${dep}'가 누락되었거나 종료 전입니다.`);
    }
    const conditional = task?.conditional === true || action.conditional === true;
    const condition = typeof task?.condition === 'string' ? task.condition : typeof action.condition === 'string' ? action.condition : undefined;
    // Structured arguments are copied only when provided. Preserve task tuples verbatim;
    // location/target/purpose and source/destination tuples must not be conflated.
    const parameters = { ...optionalObject(action.parameters), ...optionalObject(step.parameters) };
    return {
      sequence: typeof step.sequence === 'number' ? step.sequence : undefined,
      start, duration, end, pddl_action: id, action_key: key, actor_unit_id: executionActor, parameters,
      planning: {
        actionId: id, actionKey: `${side}:${id}`, actorRef: actor, actorKey: `${side}:${actor}`,
        forceSide: side, lane: typeof step.lane === 'string' ? step.lane : '', sourceTaskId,
        task: action.task, timelineTask: step.task, sourceTask: task,
        dependsOn: deps.map(dep => `${side}:${dep}`), conditional, condition,
        mapPreconditions: step.map_preconditions, goalEffects: step.goal_effects,
      },
    };
  });
  return { forceSide: side, format: 'planning', steps, issues, context };
}
