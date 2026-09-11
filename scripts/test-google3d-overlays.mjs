import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/features/simulation/lib/google3DOverlayStore.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createOverlayStore, createOverlaySchedule } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
let created = 0, appended = 0, removed = 0, assigned = 0, interpolated = 0;
const nodes = [];
const store = createOverlayStore((kind, options) => {
  created++;
  const node = new Proxy({ kind, ...options, remove() { removed++; } }, {
    set(target, key, value) { assigned++; target[key] = value; return true; },
  });
  nodes.push(node);
  return node;
}, () => { appended++; }, path => { interpolated++; return path; });
const options = offset => ({ path: [{ lat: 37, lng: 126 }, { lat: 37.01, lng: 126 + offset }], strokeColor: '#ff0000' });

// Ten simultaneous actions with a stationary fire line and an animated area.
for (let frame = 0; frame < 120; frame++) {
  store.begin();
  for (let action = 0; action < 10; action++) {
    store.put(`${action}:line`, 'line', options(0));
    store.put(`${action}:pulse`, 'polygon', options(frame / 100000));
  }
  store.end();
}
assert.equal(created, 20);
assert.equal(appended, 20);
assert.equal(removed, 0);
assert.equal(assigned, 1190, 'only the ten animated paths change after initialization');
assert.equal(interpolated, 1210, 'stationary geometry is interpolated only once');
store.begin();
store.put('0:line', 'line', options(0));
store.end();
assert.equal(removed, 19, 'ended actions are removed, surviving actions retain their nodes');
assert.equal(created, 20);
store.begin(); store.end();
assert.equal(removed, 20);
store.begin(); store.put('0:line', 'line', options(0)); store.end();
assert.equal(created, 21, 'seeking back restores an expired action');
store.clear(); store.clear();
assert.equal(removed, 21, 'cleanup is idempotent');

for (const speed of [0.125, 1, 10]) {
  const shouldUpdate = createOverlaySchedule(75);
  let updates = 0;
  for (let frame = 0; frame < 120; frame++) {
    const ms = frame * 1000 / 60;
    if (shouldUpdate(ms, ms / 1000 * speed, true)) updates++;
  }
  assert.ok(updates >= 23 && updates <= 25, `wall-clock frequency stays stable at speed ${speed}: ${updates}`);
}
const schedule = createOverlaySchedule(75);
assert.equal(schedule(0, 1, true), true);
assert.equal(schedule(10, 1.001, true), false);
assert.equal(schedule(11, 1.002, false), true, 'pause publishes the exact final snapshot');
assert.equal(schedule(12, 1.002, false), false, 'paused effects do not recalculate');
assert.equal(schedule(13, 0, true), true, 'rewind is immediate');
assert.equal(schedule(14, 5, true, true), true, 'seek is immediate');
console.log('PASS: 120 updates × 20 overlays: 20 creations / 0 removals during playback (previously 2,400 creations / 2,380 removals).');
console.log('PASS: unchanged paths, action expiry, rewind, cleanup, wall-clock throttle, pause and seek.');
