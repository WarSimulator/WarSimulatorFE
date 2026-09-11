import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Load the real TypeScript modules without installing an additional test runner.
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const agentUrl = moduleUrl(await compile('../src/features/simulation/lib/unitAgent.ts'));
const runtimeUrl = moduleUrl((await compile('../src/features/simulation/lib/unitAgentRuntime.ts'))
  .replace("'./unitAgent'", JSON.stringify(agentUrl)));
const { createUnitAgentRuntime } = await import(runtimeUrl);
const { getCommanderReports, getUnitAgentState } = await import(agentUrl);
const result = {
  startTime: 0, endTime: 12, unitTracks: [], events: [],
  actionEffects: [
    { unitId: 'a', action: 'Move', actionSequence: 1, startTime: 1, endTime: 3, parameters: {} },
    { unitId: 'a', action: 'Engage', actionSequence: 2, startTime: 5, endTime: 7, parameters: {} },
  ],
};
const runtime = createUnitAgentRuntime(result, undefined, ['a', 'idle']);
runtime.advanceTo(4);
const checkpoint = runtime.getState('a', 4);
assert.equal(checkpoint.commandState, 'READY');
assert.equal(runtime.getState('a', 2).commandState, 'EXECUTING');
assert.equal(runtime.getState('a', 4), checkpoint, 'stale display reads must not reset engine snapshots');
runtime.advanceTo(2);
assert.equal(runtime.getState('a', 4), checkpoint, 'delayed playback ticks must not rewind');
for (const time of [5, 6, 7, 10, 12]) {
  runtime.advanceTo(time);
  assert.deepEqual(runtime.getState('a', time), getUnitAgentState(result, undefined, 'a', time));
}
assert.equal(runtime.getState('idle', 12).commandState, 'STOPPED', 'idle units finish on the shared clock');
runtime.seekTo(2);
assert.deepEqual(runtime.getState('a', 2), getUnitAgentState(result, undefined, 'a', 2));
runtime.seekTo(0);
assert.equal(runtime.getState('a', 0).fatiguePct, 0, 'restart restores initial resources');
runtime.advanceTo(6);
assert.deepEqual(runtime.getState('a', 6), getUnitAgentState(result, undefined, 'a', 6));
const reports = getCommanderReports(result);
assert.ok(reports.some(report => report.type === 'COMMAND_ACCEPTED'));
assert.ok(reports.some(report => report.type === 'EXECUTION_STARTED'));
assert.ok(reports.some(report => report.type === 'EXECUTION_COMPLETED'));
assert.ok(reports.every(report => report.recipient === 'ai-commander'));
assert.ok(reports.every(report => !/[가-힣]/.test(report.message)), 'Commander messages must remain English');
assert.deepEqual(reports, [...reports].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)));
console.log('PASS: stale reads/ticks, command boundaries, finish, seek, restart, deterministic resources, Commander reports');
