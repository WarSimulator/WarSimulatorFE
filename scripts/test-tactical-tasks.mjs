import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export * from './src/features/simulation/lib/tacticalTasks'; export * from './src/features/simulation/lib/renderTacticalGraphic'; export * from './src/features/simulation/lib/deploymentStorage';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' } });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const saved=new Map();globalThis.window={localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)}};
let count=0;
for(const task of api.tacticalTasks){
 for(const affiliation of ['friendly','enemy']){
  const graphic=api.createTaskGraphic(task,affiliation,task.samplePoints);
  assert.equal(graphic.tacticalSymbol.sidc[3],affiliation==='enemy'?'6':'3');
  for(const scale of [20000,100000,500000]) {
   const features=api.renderTacticalGraphic(graphic,scale);
   assert.ok(features.length>0,task.id);
   for(const f of features) {assert.equal(f.properties.id,graphic.id);assert.ok(!/NaN|Infinity/.test(JSON.stringify(f)),task.id);}
   count++;
  }
  const deployment=api.createEmptyDeployment('test-task','Task persistence test');deployment.units=[];deployment.tacticalGraphics=[graphic];
  api.saveDeployment(deployment);
  const restored=api.getDeploymentById(deployment.id);
  assert.deepEqual(restored.tacticalGraphics[0],graphic);
  const copy=api.duplicateDeployment(restored,'Copy');assert.notEqual(copy.tacticalGraphics[0].id,graphic.id);assert.deepEqual(copy.tacticalGraphics[0].tacticalSymbol,graphic.tacticalSymbol);
  assert.throws(()=>api.createTaskGraphic(task,affiliation,[]));
 }
}
const task=api.tacticalTasks.find(t=>t.minPoints===3&&t.maxPoints===3);
assert.throws(()=>api.createTaskGraphic(task,'friendly',[...task.samplePoints,[-118.1,34.1]]));
assert.throws(()=>api.createTaskGraphic(task,'friendly',[task.samplePoints[0],task.samplePoints[0],task.samplePoints[1]]));
const arrow=api.tacticalTasks.find(t=>t.maxPoints===50);
assert.ok(api.renderTacticalGraphic(api.createTaskGraphic(arrow,'friendly',[[-118.3,34.1],[-118.27,34.11],[-118.24,34.12],[-118.2,34.1],[-118.22,34.09]]),100000).length>0);
console.log(`PASS: ${api.tacticalTasks.length} task definitions, ${count} affiliation/scale renders, variable-point arrow, point validation, persistence and duplication.`);
