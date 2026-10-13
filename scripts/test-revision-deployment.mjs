import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: "export { buildRevisionDeployment } from './src/features/simulation/lib/replanSnapshot';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' } });
const { buildRevisionDeployment } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const unit = id => ({ id, designation: id, affiliation: 'friendly', unitType: 'infantry', echelon: 'company', position: { longitude: 127, latitude: 37 } });
const deployment = { id: 'source', name: 'Source', mettTcDocumentId: '', units: [unit('moving'), unit('static'), unit('destroyed')], objectives: [{ id: 'objective', name: 'Objective', position: { longitude: 128, latitude: 38 } }], tacticalGraphics: [], mapView: { center: [127, 37], zoom: 12 } };
const result = { id: 'result', startTime: 0, endTime: 60, events: [], actionEffects: [], unitTracks: [
  { unitId: 'moving', actor: 'moving', segments: [{ keyframes: [{ time: 0, position: { longitude: 127, latitude: 37 } }, { time: 60, position: { longitude: 128, latitude: 38 } }] }] },
  { unitId: 'destroyed', actor: 'destroyed', eliminatedAt: 20, segments: [] },
] };
const original = structuredClone(deployment);
const getUnitState = (_id, time) => ({ combatPowerPct: 100 - time, ammunitionPct: 50, mobilityPct: 80, fatiguePct: 20, suppressionPct: 0 });
const at = simulationTime => buildRevisionDeployment({ deployment, result, simulationTime, getUnitState });
const paused = at(30);
assert.deepEqual(paused.units.find(u => u.id === 'moving').position, { longitude: 127.5, latitude: 37.5, lon: 127.5, lat: 37.5 });
assert.deepEqual(paused.units.find(u => u.id === 'static').position, { longitude: 127, latitude: 37, lon: 127, lat: 37 });
assert.ok(!paused.units.some(u => u.id === 'destroyed'), 'Eliminated units must not reappear in the editor');
assert.equal(paused.units[0].initialState.combatPowerPct, 70);
assert.ok(at(10).units.some(u => u.id === 'destroyed'), 'Re-entering at an earlier time must rebuild the snapshot');
assert.equal(at(45).units.find(u => u.id === 'moving').position.longitude, 127.75);
assert.deepEqual(paused.objectives, deployment.objectives);
assert.deepEqual(paused.mapView, deployment.mapView);
assert.equal(paused.id, deployment.id);
assert.deepEqual(deployment, original, 'Entering REVISION must not mutate the original playback deployment');
console.log('PASS: paused-time positions, static fallback, eliminated units, current unit state, repeated entry and immutable playback deployment.');
