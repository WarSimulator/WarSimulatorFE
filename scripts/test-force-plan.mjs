import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const json = async path => JSON.parse(await read(path));
const compile = async path => ts.transpileModule(await read(path), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const parserUrl = moduleUrl(await compile('../src/features/simulation/lib/forcePlan.ts'));
const { parseForcePlan, ForcePlanError } = await import(parserUrl);
const blue = await json('../plan/ver4/BlueForce_v4.json');
const red = await json('../plan/ver4/RedForce_v4.json');
const deployment = await json('../plan/ver4/Deployment_v4.json');
const original = JSON.stringify([blue, red, deployment]);
const parsedBlue = parseForcePlan(blue, 'BLUE');
const parsedRed = parseForcePlan(red, 'RED');
assert.equal(parsedBlue.steps.length, 72);
assert.equal(parsedRed.steps.length, 37);
for (const [raw, parsed] of [[blue, parsedBlue], [red, parsedRed]]) {
  assert.equal(parsed.format, 'planning');
  assert.equal(new Set(parsed.steps.map(s => s.planning.actionKey)).size, parsed.steps.length);
  for (const step of parsed.steps) {
    const source = raw.generated_decomposition.actions.find(a => a.action_id === step.planning.actionId);
    const timeline = raw.temporal_plan.timeline.steps.find(a => a.pddl_action === step.planning.actionId);
    assert.deepEqual([step.start, step.duration, step.end], [timeline.start, timeline.duration, timeline.end]);
    assert.deepEqual(step.planning.task, source.task);
    assert.deepEqual(step.planning.mapPreconditions, timeline.map_preconditions);
    const binding = parsed.context.roleBindings.find(item => item.detected_unit_id === timeline.unit);
    assert.equal(step.actor_unit_id, binding?.internal_role_actor ?? timeline.unit);
    assert.equal(step.planning.actorRef, timeline.unit);
    assert.deepEqual(step.parameters, {}, 'unstructured task text must not become invented parameters');
  }
}
assert.equal(parsedBlue.steps.filter(s => s.planning.conditional).length, 11);
assert.equal(parsedRed.steps.filter(s => s.planning.conditional).length, 5);
assert.ok(parsedRed.issues.some(i => i.code === 'MISSING_TASK_DEPENDENCY' && i.message.includes('D-ENGINEER')));
assert.equal(parsedBlue.context.roleBindings.length, 4);
assert.equal(parsedRed.context.roleBindings.length, 1);
assert.throws(() => parseForcePlan(blue, 'RED'), /진영/);
assert.throws(() => parseForcePlan(red, 'BLUE'), /진영/);
assert.notEqual(parsedBlue.steps.find(s => s.actor_unit_id === 'MUSR121_004').planning.actorKey,
  parsedRed.steps.find(s => s.actor_unit_id === 'MUSR121_004').planning.actorKey);

// Mission family must never decide the force side.
const swappedMission = structuredClone(blue);
swappedMission.mission_family = 'DEFENSIVE';
assert.equal(parseForcePlan(swappedMission, 'BLUE').forceSide, 'BLUE');

for (const [mutate, expected] of [
  [p => { p.temporal_plan.timeline.steps.push(p.temporal_plan.timeline.steps[0]); }, /중복 ID/],
  [p => { p.temporal_plan.timeline.steps[0].atomic_action = 'aa-report'; }, /행동 종류/],
  [p => { p.temporal_plan.timeline.steps[0].unit = 'different'; }, /행동 주체/],
  [p => { p.temporal_plan.timeline.steps[0].end = -1; }, /시간/],
  [p => { p.temporal_plan.timeline.steps[0].duration = Number.NaN; }, /시간/],
  [p => { p.generated_decomposition.actions[0].depends_on = ['missing']; }, /선행 행동/],
  [p => { p.temporal_plan.timeline.step_count = 1; }, /step_count/],
  [p => { p.complete = false; }, /complete=false/],
  [p => { p.generated_decomposition.actions[0].depends_on = [p.generated_decomposition.actions[1].action_id]; }, /종료 전/],
]) {
  const changed = structuredClone(blue);
  mutate(changed);
  assert.throws(() => parseForcePlan(changed, 'BLUE'), expected);
}

// Import the real builder, including its SIDC helper, without another test dependency.
const echelonsUrl = moduleUrl(await compile('../src/features/simulation/lib/echelons.ts'));
const catalogUrl = moduleUrl(`export default ${await read('../src/features/simulation/data/symbolCatalog.json')}`);
const sidcUrl = moduleUrl((await compile('../src/features/simulation/lib/sidc.ts'))
  .replace("'./echelons'", JSON.stringify(echelonsUrl))
  .replace("'../data/symbolCatalog.json'", JSON.stringify(catalogUrl)));
const builderUrl = moduleUrl((await compile('../src/features/simulation/lib/finalSimulation.ts'))
  .replace("'./sidc'", JSON.stringify(sidcUrl))
  .replace("'./forcePlan'", JSON.stringify(parserUrl)));
const { buildFinalSimulation } = await import(builderUrl);
let routeCalls = 0;
globalThis.window = { setTimeout, clearTimeout };
globalThis.fetch = async () => { routeCalls++; throw new Error('Offline test'); };
await assert.rejects(buildFinalSimulation({ blueForce: blue, redForce: red, deployment }), error => {
  assert.ok(error instanceof ForcePlanError);
  const codes = new Set(error.issues.map(i => i.code));
  for (const code of ['MISSING_TASK_DEPENDENCY', 'UNRESOLVED_ACTOR', 'UNRESOLVED_REFERENCE', 'UNSUPPORTED_CONDITION']) assert.ok(codes.has(code), code);
  assert.ok(!error.message.includes('배열을 찾을 수 없습니다'), 'new format is parsed before execution validation');
  const unresolvedActors = error.issues.filter(i => i.code === 'UNRESOLVED_ACTOR').map(i => i.message).join('\n');
  for (const actor of ['MUSR121_004', 'MUSR121_007', 'MUSR121_008', 'MUSR121_013']) assert.ok(unresolvedActors.includes(actor), actor);
  assert.ok(unresolvedActors.includes('division-fires'), 'unbound functional actors must remain explicit');
  return true;
});
assert.equal(routeCalls, 0, 'invalid packages fail before external routing');
assert.equal(JSON.stringify([blue, red, deployment]), original, 'input files/data remain unchanged');

// Existing execution JSON still builds through the same public entry point.
const legacyBlue = await json('../plan/ver1/offensive.json');
const legacyRed = await json('../plan/ver1/defensive.json');
const legacyDeployment = await json('../plan/ver1/unit.json');
const legacy = await buildFinalSimulation({ blueForce: legacyBlue, redForce: legacyRed, deployment: legacyDeployment });
assert.equal(legacy.result.actionEffects.length, legacyBlue.temporal_plan.steps.length + legacyRed.temporal_plan.steps.length);
assert.equal(legacy.planCounts.blueForce, legacyBlue.temporal_plan.steps.length);
assert.ok(legacy.result.unitTracks.some(t => t.segments.some(s => s.action === 'Move')));

// A fully bound, unconditional Planning package reaches playback; IDs are side-scoped.
function reportPlan(side) {
  return {
    complete: true, force_side: side,
    candidate: { tasks: [{ task_id: 'T', depends_on: [], conditional: false }] },
    generated_decomposition: { action_count: 1, actions: [{
      action_id: 'report-1', unit: 'same-name', canonical_action_key: 'report', duration: 1,
      depends_on: [], source_generated_task_id: 'T', task: ['report', 'status'],
    }] },
    temporal_plan: { timeline: { step_count: 1, steps: [{
      pddl_action: 'report-1', unit: 'same-name', atomic_action: 'aa-report', sequence: 1,
      start: 0, duration: 1, end: 1,
    }] } },
  };
}
const pair = {
  units: ['friendly', 'enemy'].map((affiliation, i) => ({
    id: `unit-${i}`, designation: 'same-name', affiliation, unitType: 'infantry', echelon: 'company',
    position: { longitude: 127 + i, latitude: 38 }, sidc: 'SFGPUCI---*****',
  })), objectives: [], tacticalGraphics: [],
};
const built = await buildFinalSimulation({ blueForce: reportPlan('BLUE'), redForce: reportPlan('RED'), deployment: pair });
assert.deepEqual(built.result.actionEffects.map(e => e.unitId), ['unit-0', 'unit-1']);
assert.deepEqual(built.result.actionEffects.map(e => e.parameters.forceSide), ['BLUE', 'RED']);
assert.deepEqual(built.result.actionEffects.map(e => e.parameters.planning.actionKey), ['BLUE:report-1', 'RED:report-1']);
const ambiguous = structuredClone(pair);
ambiguous.units.push({ ...ambiguous.units[0], id: 'another-blue' });
await assert.rejects(buildFinalSimulation({ blueForce: reportPlan('BLUE'), redForce: reportPlan('RED'), deployment: ambiguous }), /배치 연결이 2개/);

for (const designation of ['div-cav-sqn', 'mech-bde-north', 'mech-bde-south', 'tank-heavy-bde',
  'MUSR121_004', 'MUSR121_005', 'MUSR121_006', 'MUSR121_007', 'MUSR121_008', 'MUSR121_009',
  'MUSR121_010', 'MUSR121_011', 'MUSR121_012', 'MUSR121_014', 'MUSR121_015']) {
  assert.ok(deployment.units.some(unit => unit.designation === designation), designation);
}
assert.equal(deployment.units.filter(unit => unit.designation === 'div-cav-sqn').length, 2);

// Equal labels on opposite sides must not redirect an observation to the first track.
const playbackUrl = moduleUrl(await compile('../src/features/simulation/lib/playback.ts'));
const { getTrackPositionsAtTime } = await import(playbackUrl);
const observationUrl = moduleUrl((await compile('../src/features/simulation/lib/observation.ts'))
  .replace("'./playback'", JSON.stringify(playbackUrl))
  .replaceAll("'@atlas/atomic-actions'", JSON.stringify(import.meta.resolve('@atlas/atomic-actions'))));
const { toObservationSectorFeatures } = await import(observationUrl);
const observationResult = structuredClone(built.result);
observationResult.actionEffects = [{ actionSequence: 999, unitId: 'unit-1' }];
observationResult.observationEffects = [{ actionSequence: 999, actor: 'same-name', target: 'test',
  startTime: 0, endTime: 100, origin: { longitude: 0, latitude: 0 }, direction: 0,
  fovDegrees: 60, rangeMeters: 100, displayRangeMeters: 100, targetInRange: true }];
const sectors = toObservationSectorFeatures(observationResult, 1, built.deployment);
const redPosition = built.deployment.units.find(u => u.id === 'unit-1').position;
assert.equal(sectors.features.length, 4);
assert.deepEqual(sectors.features[0].geometry.coordinates[0][0], [redPosition.longitude, redPosition.latitude]);
// Older results without actionEffects continue to use the actor fallback.
delete observationResult.actionEffects;
assert.equal(toObservationSectorFeatures(observationResult, 1, built.deployment).features.length, 4);
const eliminationResult = {
  unitTracks: [{ unitId: 'south-enemy', actor: 'South mecha enemy', startTime: 0, endTime: 30, eliminatedAt: 22,
    segments: [{ actionSequence: 0, action: 'Hold', startTime: 0, endTime: 30, keyframes: [
      { time: 0, position: { longitude: 127, latitude: 38 } }, { time: 30, position: { longitude: 127, latitude: 38 } },
    ] }] }],
  actionEffects: [{ actionSequence: 1, unitId: 'south-enemy', actor: 'South mecha enemy', origin: { longitude: 127, latitude: 38 }, parameters: {} }],
};
assert.equal(getTrackPositionsAtTime(eliminationResult, 21.99).length, 1, 'target remains visible until destruction completes');
assert.equal(getTrackPositionsAtTime(eliminationResult, 22).length, 0, 'eliminated target is not reinserted by action fallback');
assert.equal(JSON.stringify([blue, red, deployment]), original);
console.log('PASS: 109 source steps; Plan actor aliases; Deployment designations; legacy and Planning playback; duplicate-label observation identity; input immutability');
