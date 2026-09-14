import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { build } from 'esbuild';
import ms from 'milsymbol';
const bundle = await build({
  stdin: { contents: "export * from './src/features/simulation/lib/sidc'; export * from './src/features/simulation/lib/echelons'; export * from './src/features/simulation/lib/deploymentStorage'; export * from './src/features/simulation/lib/militarySymbolRegistry'; export * from './src/features/simulation/lib/symbolSvg';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
});
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const saved = new Map();
// Regression: 270701 must not silently regress to the upstream empty box.
for (const [sidc, standard] of [['10032500002707010000', 'APP6'], ['13032500002707010000', '2525']]) {
  for (const affiliation of ['3', '6']) {
    const code = sidc.slice(0, 3) + affiliation + sidc.slice(4);
    const svg = api.createMilitarySymbolSvg(code, 64, undefined, standard);
    assert.equal((svg.match(/<circle /g) || []).length, 8, 'Four mines plus their contrast halos');
    assert.ok(svg.includes('viewBox="0 0 40 104"'));
  }
}
globalThis.window = { localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,value) } };
assert.equal(new Set(api.symbolCatalog.map(s => s.id)).size, api.symbolCatalog.length);
assert.deepEqual(api.catalogStandards.map(s => s.id), ['2525E', 'APP6D']);
assert.ok(api.symbolCatalog.every(s => ['2525E', 'APP6D'].includes(s.standardId)));
assert.ok(api.symbolCatalog.some(s => s.standardId === '2525E'));
assert.ok(api.symbolCatalog.some(s => s.standardId === 'APP6D'));

const normalizeSvg = svg => svg.replace(/<title>.*?<\/title>/g, '').replace(/\s(?:width|height)="[^"]*"/g, '').replace(/\s+/g, ' ').trim();
const fingerprints = new Set();
for (const definition of api.symbolCatalog) {
  const enemy = definition.sidc.slice(0, 3) + '6' + definition.sidc.slice(4);
  const rendered = [definition.sidc, enemy].map(sidc => api.createMilitarySymbolSvg(sidc, 30, undefined, definition.standard));
  const fingerprint = crypto.createHash('sha256').update(rendered.map(normalizeSvg).join('\n')).digest('hex');
  const key = JSON.stringify([definition.supportsEchelon, fingerprint]);
  if (!definition.dedupReviewRequired) {
    assert.equal(fingerprints.has(key), false, `Equivalent duplicate retained: ${definition.id}`);
    fingerprints.add(key);
  }
}
const duplicateReport = JSON.parse(fs.readFileSync(new URL('./symbol-catalog-duplicates.json', import.meta.url)));
assert.ok(duplicateReport.duplicateCount > 0);
assert.ok(duplicateReport.duplicates.some(item => item.excluded.standard === 'APP6D' && item.retained.standard === '2525E'));
for (const id of ['catalog:APP6D:10032500002707010000', 'catalog:2525E:13032500002707010000', 'catalog:2525E:13031500002100000000']) {
  assert.ok(api.getSymbolDefinition(id), `Meaningful symbol lost: ${id}`);
}
for (const {excluded, retained} of duplicateReport.duplicates) {
  const alias = api.getSymbolDefinition(`catalog:${excluded.standard}:${excluded.sidc}`);
  assert.equal(alias.label, excluded.label);
  assert.equal(alias.sidc, excluded.sidc);
  const representative = api.symbolCatalog.find(item => item.sidc === retained.sidc && item.standardId === retained.standard);
  assert.ok(representative.aliases.some(item => item.sidc === excluded.sidc && item.standardId === excluded.standard));
  assert.equal(api.createMilitarySymbolSvg(alias.sidc,30,undefined,alias.standard), api.createMilitarySymbolSvg(representative.sidc,30,undefined,representative.standard));
}
assert.equal(api.symbolCatalog.filter(item => item.sidc.slice(4,6) === '25' && item.sidc.slice(10,16) === '270701').length, 1);
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
// Persistence must retain numeric/letter SIDCs through migration and cloning.
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
assert.notEqual(api.getMilitarySymbolImageId('SFGPUCI----E---', '2525'), api.getMilitarySymbolImageId('SFGPUCI----E---', 'APP6'));
console.log(`PASS: ${checked.toLocaleString()} rendered affiliation/echelon combinations; deduplication, legacy codes and persistence.`);

// Equipment such as tanks must honor the selected echelon, including edits.
for (const standardId of ['2525E']) {
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
console.log('PASS: tank echelon editing and persistence for the retained MIL-STD-2525E representative.');
