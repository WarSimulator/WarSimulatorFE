/**
 * Build a compact recognition/reference dataset for every item in the
 * Simulator's DRAW + tactical-task palette. Multi-point task previews come
 * from the same generated task definitions the UI displays; point tactical
 * tasks use the bundled MIL-STD icon renderer.
 */
import './patch-tactical-renderer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MilStdAttributes, MilStdIconRenderer } from '@armyc2.c5isr.renderer/mil-sym-ts-web';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const taskDataPath = path.join(repositoryRoot, 'src/features/simulation/data/tacticalTasks.json');
const datasetDirectory = path.join(repositoryRoot, 'artifacts/tactical-task-symbol-recognition');
const taskImageDirectory = path.join(datasetDirectory, 'images/2525E');
const drawImageDirectory = path.join(datasetDirectory, 'images/draw');
const tasks = JSON.parse(fs.readFileSync(taskDataPath, 'utf8'));

if (fs.existsSync(datasetDirectory)) {
  throw new Error(`Dataset directory already exists: ${datasetDirectory}`);
}

function slug(value) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'task';
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function geometryPoints(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates.flat();
  return [];
}

function taskPreviewSvg(task) {
  const features = task.preview ?? [];
  const points = [...task.samplePoints, ...features.flatMap(feature => geometryPoints(feature.geometry))];
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const scale = Math.min(170 / (maxX - minX || 1), 95 / (maxY - minY || 1));
  const x = value => 15 + (value - minX) * scale;
  const y = value => 15 + (maxY - value) * scale;
  const line = coordinates => `<polyline points="${coordinates.map(point => `${x(point[0]).toFixed(2)},${y(point[1]).toFixed(2)}`).join(' ')}" fill="none" stroke="#0f172a" stroke-width="1.5"/>`;
  const symbolLines = features.flatMap(feature => {
    if (feature.geometry?.type === 'LineString') return [line(feature.geometry.coordinates)];
    if (feature.geometry?.type === 'MultiLineString' || feature.geometry?.type === 'Polygon') return feature.geometry.coordinates.map(line);
    return [];
  }).join('');
  const labels = features.filter(feature => feature.geometry?.type === 'Point' && feature.properties?.label)
    .map(feature => `<text x="${x(feature.geometry.coordinates[0]).toFixed(2)}" y="${y(feature.geometry.coordinates[1]).toFixed(2)}" font-family="Arial, sans-serif" font-size="9" text-anchor="middle" fill="#0f172a">${xml(feature.properties.label)}</text>`).join('');
  const controlPoints = task.samplePoints.map((point, index) => `<g><circle cx="${x(point[0]).toFixed(2)}" cy="${y(point[1]).toFixed(2)}" r="7" fill="#1d4ed8"/><text x="${x(point[0]).toFixed(2)}" y="${(y(point[1]) + 3).toFixed(2)}" font-family="Arial, sans-serif" font-size="9" text-anchor="middle" fill="#ffffff">${index + 1}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="125" viewBox="0 0 200 125" role="img" aria-label="${xml(task.label)} tactical task preview"><rect width="200" height="125" fill="#f1f5f9"/>${symbolLines}${labels}${controlPoints}</svg>\n`;
}

const basicDrawTools = [
  { type: 'route', label: 'Route', minPoints: 2, maxPoints: null, markup: '<path d="M25 88 L70 65 L125 65 L175 35" stroke-dasharray="8 5"/>' },
  { type: 'axis', label: 'Axis', minPoints: 2, maxPoints: null, markup: '<path d="M25 88 L150 43"/><path d="M150 43 L138 43 M150 43 L143 55"/>' },
  { type: 'phase-line', label: 'Phase Line', minPoints: 2, maxPoints: null, markup: '<path d="M25 90 L70 65 L125 65 L175 35"/><text x="98" y="52" font-size="12" text-anchor="middle" fill="#0f172a" stroke="none">PL</text>' },
  { type: 'boundary', label: 'Boundary', minPoints: 2, maxPoints: null, markup: '<path d="M25 90 L70 65 L125 65 L175 35" stroke-dasharray="10 7"/>' },
  { type: 'area', label: 'Area', minPoints: 3, maxPoints: null, markup: '<path d="M45 95 L105 25 L165 90 Z" fill="#dbeafe" fill-opacity=".5"/>' },
  { type: 'freehand', label: 'Freehand', minPoints: 2, maxPoints: null, markup: '<path d="M25 85 C35 10 75 110 100 60 S150 25 175 45"/>' },
];

fs.mkdirSync(taskImageDirectory, { recursive: true });
fs.mkdirSync(drawImageDirectory, { recursive: true });

const manifest = [];
for (const tool of basicDrawTools) {
  const image = `images/draw/${tool.type}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="125" viewBox="0 0 200 125" role="img" aria-label="${tool.label} draw tool"><rect width="200" height="125" fill="#f1f5f9"/><g fill="none" stroke="#0f172a" stroke-width="2">${tool.markup}</g></svg>\n`;
  fs.writeFileSync(path.join(datasetDirectory, image), svg);
  manifest.push({
    id: `draw-basic-${tool.type}`,
    image,
    task: 'atlas_draw_tool_classification',
    labels: { category: 'basic_draw_tool', graphic_type: tool.type, label: tool.label, min_points: tool.minPoints, max_points: tool.maxPoints },
    expected_response: { graphic_type: tool.type, label: tool.label },
  });
}

for (const task of tasks) {
  const filename = `2525E-${task.sidc}-${slug(task.label)}.svg`;
  const image = `images/2525E/${filename}`;
  const svg = task.pointSymbol
    ? `${MilStdIconRenderer.getInstance().RenderSVG(task.sidc, new Map(), new Map([[MilStdAttributes.PixelSize, '128']])).getSVG()}\n`
    : taskPreviewSvg(task);
  fs.writeFileSync(path.join(datasetDirectory, image), svg);
  manifest.push({
    id: `tactical-task-${task.id.replace(':', '-')}`,
    image,
    task: 'mil_std_2525e_tactical_task_classification',
    labels: {
      standard: task.standard,
      sidc: task.sidc,
      category: 'tactical_task',
      label: task.label,
      korean: task.korean,
      min_points: task.minPoints,
      max_points: task.maxPoints,
      draw_rule: task.drawRule,
      point_symbol: Boolean(task.pointSymbol),
    },
    expected_response: { standard: task.standard, tactical_task: task.label, korean: task.korean },
  });
}

fs.writeFileSync(path.join(datasetDirectory, 'manifest.jsonl'), `${manifest.map(entry => JSON.stringify(entry)).join('\n')}\n`);
fs.writeFileSync(path.join(datasetDirectory, 'dataset.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  renderer: { package: '@armyc2.c5isr.renderer/mil-sym-ts-web', imageFormat: 'SVG' },
  scope: 'Every visible entry in the Simulator DRAW + tactical-task palette. Tactical tasks use the generated UI preview geometry; point tasks use the bundled MIL-STD icon renderer.',
  classes: { basicDrawTools: basicDrawTools.length, tacticalTasks: tasks.length, tacticalPointTasks: tasks.filter(task => task.pointSymbol).length, standards: ['ATLAS DRAW', '2525E'] },
  examples: manifest.length,
  manifest: 'manifest.jsonl',
}, null, 2)}\n`);
fs.copyFileSync(path.join(repositoryRoot, 'public/mil-sym-ts-LICENSE.txt'), path.join(datasetDirectory, 'LICENSES.txt'));

console.log(`Dataset: ${manifest.length} DRAW/tactical-task SVGs written to ${path.relative(repositoryRoot, datasetDirectory)}`);
