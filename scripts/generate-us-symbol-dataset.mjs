/**
 * Build a recognition dataset from the Simulator's MIL-STD-2525E catalog.
 * Each catalog symbol is rendered once: this deliberately excludes synthetic
 * affiliation/echelon permutations so the dataset has one image per base symbol.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ms from 'milsymbol';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const catalogPath = path.join(repositoryRoot, 'src/features/simulation/data/symbolCatalog.json');
const datasetDirectory = path.join(repositoryRoot, 'artifacts/us-unit-symbol-recognition');
const imagesDirectory = path.join(datasetDirectory, 'images/2525E');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const symbols = catalog.symbols.filter((symbol) => symbol.standardId === '2525E');

if (fs.existsSync(datasetDirectory)) {
  throw new Error(`Dataset directory already exists: ${datasetDirectory}`);
}

function slug(value) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 96) || 'symbol';
}

function affiliationFor(sidc) {
  return sidc[3] === '6' ? 'enemy' : 'friendly';
}

fs.mkdirSync(imagesDirectory, { recursive: true });
const manifest = symbols.map((symbol) => {
  const affiliation = affiliationFor(symbol.sidc);
  const filename = `2525E-${symbol.sidc}-${slug(symbol.label)}.svg`;
  const image = `images/2525E/${filename}`;
  const svg = new ms.Symbol(symbol.sidc, { standard: '2525', size: 128 }).asSVG();
  fs.writeFileSync(path.join(imagesDirectory, filename), svg);

  return {
    id: `us-2525E-${symbol.sidc}`,
    image,
    task: 'mil_std_2525e_symbol_classification',
    labels: {
      standard: '2525E',
      sidc: symbol.sidc,
      unit_type: symbol.label,
      category: symbol.category,
      affiliation,
      echelon: null,
      supports_echelon: symbol.supportsEchelon,
      remarks: symbol.remarks || undefined,
    },
    expected_response: {
      standard: '2525E',
      unit_type: symbol.label,
      category: symbol.category,
    },
  };
});

const categories = Object.fromEntries(
  Object.entries(Object.groupBy(symbols, (symbol) => symbol.category)).map(([category, entries]) => [category, entries.length]),
);

fs.writeFileSync(path.join(datasetDirectory, 'manifest.jsonl'), `${manifest.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
fs.writeFileSync(path.join(datasetDirectory, 'dataset.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  renderer: { package: 'milsymbol', version: ms.version, imageFormat: 'SVG', size: 128 },
  scope: 'MIL-STD-2525E catalog symbols rendered once per base symbol; no affiliation or echelon augmentation.',
  classes: { baseSymbols: symbols.length, standards: 1, categories },
  examples: manifest.length,
  manifest: 'manifest.jsonl',
}, null, 2)}\n`);
fs.copyFileSync(path.join(repositoryRoot, 'public/symbol-catalog-LICENSE.txt'), path.join(datasetDirectory, 'LICENSES.txt'));

console.log(`Dataset: ${manifest.length} MIL-STD-2525E base-symbol SVGs written to ${path.relative(repositoryRoot, datasetDirectory)}`);
