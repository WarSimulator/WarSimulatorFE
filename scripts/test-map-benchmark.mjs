import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: "export { frameSummary, benchmarkVerdict, benchmarkStyle, BENCHMARK_CASES } from './src/features/simulation/lib/mapBenchmark';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env.BASE_URL': '"/simulator/"' } });
const { frameSummary, benchmarkVerdict, benchmarkStyle, BENCHMARK_CASES } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
assert.deepEqual(frameSummary([10,20,30,60],1000), {renderFps:4,frameP95Ms:60,slowFrames:1,frames:4});
assert.equal(frameSummary([],1000).frameP95Ms,0);
globalThis.location = { origin: 'http://localhost:5174' };
for (const test of BENCHMARK_CASES) {
 const style = benchmarkStyle(test);
 assert.equal(Object.hasOwn(style.sources.base, 'bounds'), test.bounded);
 assert.equal(Object.hasOwn(style.sources.terrainSource, 'bounds'), test.bounded);
 assert.equal(style.sources.terrainSource.maxzoom, test.demZoom);
}
const rows = ['remote-world','remote-region','local-region','local-low'].map((id,i)=>({ id,status:'완료',renderFps:20+i*2,loadMs:1000 }));
assert.match(benchmarkVerdict(rows), /범위 제한 10.0%/);
assert.match(benchmarkVerdict([...rows.slice(0,3),{...rows[3],status:'무효'}]), /모두 끝나면/);
const manifest = JSON.parse(await readFile('public/map-benchmark/manifest.json','utf8'));
for (const [kind, summary] of Object.entries(manifest.summary)) assert.ok(summary.bytes > 0 && summary.tiles > 0,kind);
// Check real local terrain and vector files at all zooms with the browser-compatible source format.
for (let z=0;z<=12;z++) {
 const x=Math.floor((127.44+180)/360*2**z),y=Math.floor((1-Math.asinh(Math.tan(38.44*Math.PI/180))/Math.PI)/2*2**z);
 assert.ok((await stat(`public/map-benchmark/base/${z}/${x}/${y}.mvt`)).size>0);
 const terrain=await readFile(`public/map-benchmark/terrain/${z}/${x}/${y}.webp`);
 assert.equal(terrain.toString('ascii',0,4),'RIFF');assert.equal(terrain.toString('ascii',8,12),'WEBP');
}
assert.ok((await stat('public/map-benchmark/fonts/Noto Sans Regular/0-255.pbf')).size>0);
console.log('PASS: frame statistics, invalid-result exclusion, terrain/vector coverage at every zoom and local fonts.');

const { mapBenchmarkProxy } = await import('./map-benchmark-proxy.mjs');
let handler;
assert.equal(mapBenchmarkProxy().configureServer({ middlewares: { use(fn) { handler = fn; return () => {}; } } }), undefined, 'Vite registration must not return a post-configuration handler');
for (const range of [undefined, 'bytes=0-', 'bytes=100-0', 'bytes=0-999999999']) {
 const response = { statusCode: 0, end() {} };
 await handler({url:'/simulator/map-benchmark/remote-base.pmtiles', method:'GET', headers:{range}}, response, () => { throw new Error('Unexpected next'); });
 assert.equal(response.statusCode,400);
}
console.log('PASS: regional style validation and bounded fixed-upstream Range relay.');
