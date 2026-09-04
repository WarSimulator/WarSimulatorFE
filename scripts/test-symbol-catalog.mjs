import assert from 'node:assert/strict';
import { build } from 'esbuild';
import ms from 'milsymbol';
const bundle = await build({
  stdin: { contents: "export * from './src/features/simulation/lib/sidc'; export * from './src/features/simulation/lib/echelons'; export * from './src/features/simulation/lib/deploymentStorage'; export * from './src/features/simulation/lib/militarySymbolRegistry'; export * from './src/features/simulation/lib/symbolSvg';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
});
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const saved = new Map();
globalThis.window = { localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,value) } };
assert.equal(new Set(api.symbolCatalog.map(s => s.id)).size, api.symbolCatalog.length);
assert.deepEqual(api.catalogStandards.map(s => s.id), ['2525E', 'APP6D']);
assert.ok(api.symbolCatalog.every(s => ['2525E', 'APP6D'].includes(s.standardId)));
let checked = 0;
for (const definition of api.symbolCatalog) {
  for (const affiliation of ['friendly', 'enemy']) {
    for (const { value: echelon } of api.echelonOptions) {
      const item = api.createPaletteItem({ definition, affiliation, echelon });
      assert.equal(item.kind, 'unit');
      const symbol = new ms.Symbol(item.sidc, { standard: item.symbolStandard, size: 28 });
      assert.equal(symbol.isValid(), true, `${definition.id}: ${affiliation}/${echelon}`);
      assert.equal(symbol.getMetadata().affiliation, affiliation === 'friendly' ? 'Friend' : 'Hostile');
      assert.ok(!/NaN|Infinity/.test(symbol.asSVG()), definition.id);
      // Exercise the actual palette/map renderer, including absent and present labels.
      // Passing undefined directly to milsymbol used to crash control-measure symbols.
      for (const [size, label] of [[28, undefined], [64, undefined], [42, 'TEST-1']]) {
        const svg = api.createMilitarySymbolSvg(item.sidc, size, label, item.symbolStandard);
        assert.ok(svg.startsWith('<svg'), definition.id);
        assert.ok(!/NaN|Infinity|undefined/.test(svg), `${definition.id}: size=${size}, label=${label}`);
      }
      if (definition.supportsEchelon) {
        const legacy = new ms.Symbol(api.getUnitSidc({unitType: 'infantry', affiliation, echelon}));
        assert.equal(symbol.getMetadata().echelon, legacy.getMetadata().echelon, 'Numeric and legacy echelon must agree');
      }
      checked++;
    }
  }
}
// Removed catalog entries in existing deployments must remain readable.
assert.equal(api.getUnitSidc({ unitType: 'catalog:2525C:SFGPUCI--------', sidc: 'SFGPUCI----E---', affiliation: 'friendly', echelon: 'company' }), 'SFGPUCI----E---');
// Persistence must retain numeric/letter SIDCs and standard through migration and cloning.
const examples = ['2525E', 'APP6D'].map(standard => api.symbolCatalog.find(s => s.standardId === standard && /Air|AIR/.test(s.category)));
const deployment = api.createEmptyDeployment('symbol-test', 'Symbol regression test');
deployment.units = examples.map((definition, index) => {
  const item = api.createPaletteItem({ definition, affiliation: 'enemy', echelon: 'battalion' });
  return { ...item, id: `test-${index}`, designation: item.label, symbolLabel: item.label, position: { longitude: 0, latitude: 0 } };
});
api.saveDeployment(deployment);
const restored = api.getDeploymentById(deployment.id);
for (let i = 0; i < deployment.units.length; i++) {
  assert.equal(restored.units[i].sidc, deployment.units[i].sidc);
  assert.equal(restored.units[i].symbolStandard, deployment.units[i].symbolStandard);
  assert.equal(api.getUnitSidc({ ...restored.units[i], echelon: 'platoon' }), restored.units[i].sidc, 'Aircraft must not gain unit echelon marks');
}
const copy = api.duplicateDeployment(restored, 'Copy');
assert.notEqual(copy.units[0].id, restored.units[0].id);
assert.equal(copy.units[0].sidc, restored.units[0].sidc);
assert.equal(copy.units[0].symbolStandard, restored.units[0].symbolStandard);
assert.equal(api.getUnitSidc({unitType: 'infantry', affiliation: 'friendly', echelon: 'company'}), 'SFGPUCI----E---');
assert.notEqual(api.getMilitarySymbolImageId('SFGPUCI----E---','2525'), api.getMilitarySymbolImageId('SFGPUCI----E---','APP6'), 'Different standards must not share map image cache entries');
console.log(`PASS: ${checked.toLocaleString()} rendered affiliation/echelon combinations; legacy codes, persistence, duplication and standard image keys.`);

// Equipment such as tanks must honor the selected echelon, including edits.
for (const standardId of ['2525E', 'APP6D']) {
  const tank = api.symbolCatalog.find(s => s.standardId === standardId && /Vehicles? \/ Tank$/.test(s.label));
  assert.ok(tank?.supportsEchelon);
  const placed = api.createPaletteItem({definition: tank, affiliation: 'friendly', echelon: 'company'});
  const edited = {...placed, id: `tank-${standardId}`, position: {longitude: 127, latitude: 37}, echelon: 'division'};
  edited.sidc = api.getUnitSidc(edited);
  assert.equal(edited.sidc.slice(8,10), '21');
  const deployment = api.createEmptyDeployment('tank-test', 'Tank');
  deployment.units = [edited];
  api.saveDeployment(deployment);
  const restored = api.getDeploymentById(deployment.id).units[0];
  assert.equal(restored.echelon, 'division');
  assert.equal(restored.sidc, edited.sidc);
}
console.log('PASS: tank echelon editing and persistence for MIL-STD-2525E and APP-6D.');
