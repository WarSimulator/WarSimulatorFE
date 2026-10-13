import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: "export * from './src/features/simulation/lib/localOperationMap'; export {buildFinalSimulation} from './src/features/simulation/lib/finalSimulation';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env.BASE_URL': '"/simulator/"' } });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const fixture = await read('public/map-benchmark/simulation.json');
api.assertOperationDeployment(fixture.deployment);
api.assertOperationResult(fixture.result);
assert.equal(api.isInOperationRegion(127.15, 38.25), true);
assert.equal(api.isInOperationRegion(127.75, 38.70), true);
assert.equal(api.isInOperationRegion(NaN, 38.4), false);
assert.equal(api.isInOperationRegion(127.8, 38.4), false);
for (const kind of ['unit', 'objective', 'line', 'polygon']) {
  const changed = structuredClone(fixture.deployment);
  if (kind === 'unit') changed.units[0].position = {longitude: 126, latitude: 37};
  if (kind === 'objective') changed.objectives[0].position = {longitude: 126, latitude: 37};
  if (kind === 'line') changed.tacticalGraphics.push({id:'bad',type:'axis',geometry:{type:'LineString',coordinates:[[127.4,38.4],[127.8,38.4]]}});
  if (kind === 'polygon') changed.tacticalGraphics.push({id:'bad',type:'area',geometry:{type:'Polygon',coordinates:[[[127.4,38.4],[127.8,38.4],[127.4,38.5],[127.4,38.4]]]}});
  assert.match(api.operationValidationError(changed), /작전 지역 밖/, kind);
}
const badTrack = structuredClone(fixture.result);
badTrack.unitTracks[0].segments[0].keyframes[0].position.longitude = 126;
assert.throws(() => api.assertOperationResult(badTrack), api.OperationRegionError);
const badEffect = structuredClone(fixture.result);
badEffect.observationEffects[0].targetPoint.longitude = 126;
assert.throws(() => api.assertOperationResult(badEffect), api.OperationRegionError);

globalThis.location = {origin:'http://localhost:5174'};
const style = api.createLocalOperationMapStyle();
assert.equal(style.sources.terrainSource.maxzoom, 12);
assert.equal(style.sources.base.maxzoom, 13);
assert.deepEqual(style.sources.base.bounds, api.OPERATION_BOUNDS);
for (const source of Object.values(style.sources)) for (const url of source.tiles ?? []) assert.match(url, /^http:\/\/localhost:5174\/simulator\/map-benchmark\//);
assert.match(style.glyphs, /^\/simulator\/map-benchmark\//);

const inputs = {blueForce:await read('plan/ver1/offensive.json'), redForce:await read('plan/ver1/defensive.json'), deployment:await read('plan/ver1/unit.json')};
globalThis.window = {setTimeout, clearTimeout};
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('Offline routing test'); };
const badInputs = structuredClone(inputs);
badInputs.deployment.units[0].position = {longitude:126,latitude:37};
await assert.rejects(api.buildFinalSimulation(badInputs,{localOperationRegion:true}), api.OperationRegionError);
assert.equal(calls,0,'Out-of-region deployments fail before requesting routes');
const local = await api.buildFinalSimulation(inputs,{localOperationRegion:true});
api.assertOperationDeployment(local.deployment); api.assertOperationResult(local.result);
// Road endpoints can be inside while the unsampled detour leaves the region.
globalThis.fetch = async () => ({ok:true,json:async()=>({code:'Ok',routes:[{geometry:{coordinates:[[127.4,38.4],[126,37],[127.5,38.5]]}}]})});
await assert.rejects(api.buildFinalSimulation(inputs,{localOperationRegion:true}), api.OperationRegionError);
await api.buildFinalSimulation(inputs); // Other map modes retain their existing behavior.
console.log('PASS: VER1 coverage, finite/inclusive boundaries, units/objectives/graphics, stored paths/effects, local sources, early rejection, full road detour rejection without fallback and other-mode compatibility.');
