import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const artifactDirectory = path.join(repositoryRoot, 'artifacts/military-symbol-dataset-v3');
const imagesDirectory = path.join(artifactDirectory, 'images');
const catalogPath = path.join(repositoryRoot, 'src/features/simulation/data/symbolCatalog.json');

const bundle = await build({
  entryPoints: [path.join(repositoryRoot, 'src/features/simulation/lib/symbolSvg.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { createMilitarySymbolSvg } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

fs.rmSync(imagesDirectory, { recursive: true, force: true });
fs.mkdirSync(imagesDirectory, { recursive: true });

const manifest = catalog.symbols.map((symbol) => {
  const standardDirectory = path.join(imagesDirectory, symbol.standardId);
  fs.mkdirSync(standardDirectory, { recursive: true });
  const filename = `${symbol.standardId}-${symbol.sidc}.svg`;
  const relativeImagePath = `images/${symbol.standardId}/${filename}`;
  const svg = createMilitarySymbolSvg(symbol.sidc, 128, undefined, symbol.standard);
  if (!svg.startsWith('<svg') || /NaN|Infinity|undefined/.test(svg)) {
    throw new Error(`Invalid SVG generated for ${symbol.id}`);
  }
  fs.writeFileSync(path.join(standardDirectory, filename), `${svg}\n`);
  return {
    id: symbol.id,
    image: relativeImagePath,
    label: symbol.label,
    category: symbol.category,
    standardId: symbol.standardId,
    standard: symbol.standard,
    sidc: symbol.sidc,
    supportsEchelon: symbol.supportsEchelon,
    aliases: symbol.aliases ?? [],
    dedupReviewRequired: symbol.dedupReviewRequired ?? false,
  };
});

fs.writeFileSync(path.join(artifactDirectory, 'manifest.jsonl'), `${manifest.map(entry => JSON.stringify(entry)).join('\n')}\n`);
fs.writeFileSync(path.join(artifactDirectory, 'dataset.json'), `${JSON.stringify(catalog)}\n`);
console.log(`Generated ${manifest.length} SVG images and manifest entries in ${artifactDirectory}.`);
