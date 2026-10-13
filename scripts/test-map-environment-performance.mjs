import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { DEFAULT_ENVIRONMENT } from '../src/features/simulation/lib/mapEnvironment.ts';

// Exercise the real renderer with deterministic timers and a map/WebGL test double.
const bundle = await build({
  stdin: { contents: "export { attachMapEnvironment } from './src/features/simulation/lib/mapEnvironmentRenderer';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { attachMapEnvironment } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const originals = { document: globalThis.document, window: globalThis.window, performance: globalThis.performance, setTimeout, clearTimeout };
let now = 100, nextTimer = 0, queries = 0, maxBatchQueries = 0, uploads = 0, allocations = 0, repaints = 0;
const timers = new Map();
const listeners = new Map(), sources = new Map(), layers = new Map();
const context = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
const noop = () => {};
const gl = new Proxy({
  createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
  getShaderParameter: () => true, getProgramParameter: () => true, getAttribLocation: () => 0,
  getUniformLocation: () => ({}), bufferData: () => allocations++, bufferSubData: () => uploads++,
}, { get: (target, key) => key in target ? target[key] : /^[A-Z_]+$/.test(key) ? 1 : noop });
const map = {
  getStyle: () => ({ layers: [], sky: {} }), getCenter: () => ({ lng: 127, lat: 37 }), getZoom: () => 12,
  getBounds: () => ({ getNorthWest: () => [126.99, 37.01], getSouthEast: () => [127.01, 36.99] }),
  getTerrain: () => ({}), isMoving: () => false,
  queryTerrainElevation: () => { queries++; return 100; },
  addSource: id => sources.set(id, { play: noop, pause: noop, setCoordinates: noop }), getSource: id => sources.get(id),
  addLayer: layer => { layers.set(layer.id, layer); layer.onAdd?.(map, gl); }, getLayer: id => layers.get(id),
  removeLayer: id => { layers.get(id)?.onRemove?.(map, gl); layers.delete(id); }, removeSource: id => sources.delete(id),
  setSky: noop, setPaintProperty: noop, setLayoutProperty: noop, triggerRepaint: () => repaints++,
  on: (event, fn) => { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); },
  off: (event, fn) => listeners.get(event)?.delete(fn), once: noop,
};
const fire = event => { for (const fn of listeners.get(event) ?? []) fn({ sourceId: 'terrainSource', isSourceLoaded: true }); };
const runNextTimer = () => {
  const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
  if (!next) return false;
  const [id, task] = next; timers.delete(id); now = Math.max(now, task.at);
  const before = queries; task.fn(); maxBatchQueries = Math.max(maxBatchQueries, queries - before); return true;
};
const drain = () => { let count = 0; while (runNextTimer()) assert.ok(++count < 100, 'No runaway timer loop'); };
try {
  globalThis.document = { hidden: false, createElement: () => ({ getContext: () => context }), addEventListener: noop, removeEventListener: noop };
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.performance = { now: () => now };
  globalThis.setTimeout = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const environment = attachMapEnvironment(map, DEFAULT_ENVIRONMENT);
  fire('moveend'); fire('sourcedata'); drain();
  assert.equal(queries, 0, 'Clear weather must not sample terrain');
  environment.update({ ...DEFAULT_ENVIRONMENT, weather: 'snow' }); drain();
  assert.equal(queries, 48 * 48, 'Particles must reuse the surface elevation cache');
  assert.ok(maxBatchQueries <= 192, 'Terrain sampling must yield between small batches');
  const sampledQueries = queries;
  environment.update({ ...DEFAULT_ENVIRONMENT, weather: 'snow', snowCover: 80 }); drain();
  assert.equal(queries, sampledQueries, 'Changing coverage must reuse terrain elevations');
  const layer = layers.get('environment-precipitation');
  const input = { defaultProjectionData: { mainMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const firstUpload = uploads;
  for (let i = 0; i < 120; i++) { now += 1000 / 120; layer.render(gl, input); }
  assert.ok(uploads - firstUpload <= 31, 'Particle uploads must stay near 30 Hz on 120 Hz displays');
  assert.equal(allocations, 1, 'Reuse the allocated GPU buffer');
  drain();
  fire('moveend'); runNextTimer(); // Begin a new terrain sampling batch.
  const partiallySampled = queries;
  fire('movestart'); drain();
  assert.equal(queries, partiallySampled, 'Camera movement must cancel stale sampling');
  fire('moveend'); environment.update(DEFAULT_ENVIRONMENT); drain();
  assert.equal(queries, partiallySampled, 'Clear weather must cancel pending terrain work');
  const idleRepaints = repaints;
  layer.render(gl, input); drain();
  assert.equal(repaints, idleRepaints, 'Clear weather must not keep repainting');
  environment.update({ ...DEFAULT_ENVIRONMENT, weather: 'rain' });
  environment.destroy(); drain();
  assert.equal(timers.size, 0, 'Destroy must release pending timers');
  assert.ok([...listeners.values()].every(set => set.size === 0), 'Destroy must remove map listeners');
  console.log(`PASS: ${sampledQueries} terrain queries (previously 5,584), max ${maxBatchQueries} per batch, ~30 Hz GPU uploads, cached coverage, cancelled stale work and clean teardown.`);
} finally {
  Object.assign(globalThis, originals);
}
