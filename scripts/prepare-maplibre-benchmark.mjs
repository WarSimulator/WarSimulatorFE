import { PMTiles } from 'pmtiles';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Explicitly downloadable archives; never scrape tile.openstreetmap.org.
const bounds = [127.15, 38.25, 127.75, 38.70];
const baseUrl = 'https://build.protomaps.com/20261012.pmtiles';
const terrainUrls = ['https://download.mapterhorn.com/planet.pmtiles', 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'];
const output = 'public/map-benchmark';
const base = new PMTiles(baseUrl);
const terrain = new PMTiles(terrainUrls[0]);
const xy = (lon, lat, z) => [Math.floor((lon + 180) / 360 * 2 ** z), Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z)];
const jobs = [];
for (let z = 0; z <= 13; z++) {
  const [minX, maxY] = xy(bounds[0], bounds[1], z);
  const [maxX, minY] = xy(bounds[2], bounds[3], z);
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    jobs.push({ kind: 'base', z, x, y, archive: base, ext: 'mvt' });
    if (z <= 12) jobs.push({ kind: 'terrain', z, x, y, archive: z <= 12 ? terrain : null, ext: 'webp' });
  }
}
await mkdir(output, { recursive: true });
let cursor = 0, completed = 0;
const summary = { base: { tiles: 0, bytes: 0 }, terrain: { tiles: 0, bytes: 0 } };
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const path = join(output, job.kind, String(job.z), String(job.x), `${job.y}.${job.ext}`);
    let size;
    try { size = (await stat(path)).size; }
    catch {
      let tile;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (job.archive) tile = await job.archive.getZxy(job.z, job.x, job.y);
          else {
            const response = await fetch(`https://tiles.mapterhorn.com/${job.z}/${job.x}/${job.y}.webp`, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`Terrain HTTP ${response.status}`);
            tile = { data: await response.arrayBuffer() };
          }
          break;
        }
        catch (error) { if (attempt === 2) throw error; }
      }
      if (!tile && job.kind === 'terrain') throw new Error(`Missing terrain tile ${job.z}/${job.x}/${job.y}`);
      const data = new Uint8Array(tile?.data ?? new ArrayBuffer(0));
      await mkdir(join(output, job.kind, String(job.z), String(job.x)), { recursive: true });
      await writeFile(path, data); size = data.length;
    }
    summary[job.kind].tiles++; summary[job.kind].bytes += size;
    if (++completed % 50 === 0) console.log(`${completed}/${jobs.length} tiles prepared`);
  }
}));
const fontPath = join(output, 'fonts', 'Noto Sans Regular');
await mkdir(fontPath, { recursive: true });
const font = await fetch('https://demotiles.maplibre.org/font/Noto%20Sans%20Regular/0-255.pbf', { signal: AbortSignal.timeout(20000) });
if (!font.ok) throw new Error(`Font HTTP ${font.status}`);
await writeFile(join(fontPath, '0-255.pbf'), new Uint8Array(await font.arrayBuffer()));
const manifest = { bounds, maxZoom: 13, terrainMaxZoom: 12, terrainEncoding: 'terrarium', baseUrl, terrainUrls, summary, generatedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors · Protomaps · Mapterhorn' };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));

// Freeze the VER1 road routes once so every condition replays identical data offline.
const { build } = await import('esbuild');
const compiled = await build({ stdin: { contents: "export { buildFinalSimulation } from './src/features/simulation/lib/finalSimulation';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' } });
const { buildFinalSimulation } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
globalThis.window = { setTimeout, clearTimeout };
const [blueForce, redForce, deployment] = await Promise.all(['offensive', 'defensive', 'unit'].map(name => readFile(`plan/ver1/${name}.json`, 'utf8').then(JSON.parse)));
const simulation = await buildFinalSimulation({ blueForce, redForce, deployment });
await writeFile(join(output, 'simulation.json'), JSON.stringify(simulation));
console.log('Fixed VER1 simulation package prepared; runtime road requests are unnecessary.');
