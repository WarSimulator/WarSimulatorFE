import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { createLocalOperationMapStyle } from './localOperationMap';
import type { StyleSpecification } from 'maplibre-gl';

export const BENCHMARK_BOUNDS: [number, number, number, number] = [127.15, 38.25, 127.75, 38.70];
export const BENCHMARK_CENTER: [number, number] = [127.44, 38.44];
export const BASE_ARCHIVE = 'https://build.protomaps.com/20261012.pmtiles';
export const BENCHMARK_CASES = [
  { id: 'remote-world', name: '원격 · 범위 제한 없음', local: false, bounded: false, demZoom: 12 },
  { id: 'remote-region', name: '원격 · 작전 지역 제한', local: false, bounded: true, demZoom: 12 },
  { id: 'local-region', name: '로컬 · 작전 지역 제한', local: true, bounded: true, demZoom: 12 },
  { id: 'local-low', name: '로컬 · 고도 상세도 축소', local: true, bounded: true, demZoom: 10 },
] as const;
export type BenchmarkCase = typeof BENCHMARK_CASES[number];
let registered = false;
export function benchmarkStyle(test: BenchmarkCase): StyleSpecification {
  if (test.local) return createLocalOperationMapStyle(test.demZoom);
  if (!registered) { const protocol = new Protocol(); maplibregl.addProtocol('pmtiles', protocol.tile); registered = true; }
  const local = `${import.meta.env.BASE_URL}map-benchmark`;
  const bounds = test.bounded ? { bounds: BENCHMARK_BOUNDS } : {};
  return {
    version: 8,
    // Unit labels use MapLibre's locally generated Korean glyphs.
    glyphs: `${local}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      base: { type: 'vector', ...(test.local ? { tiles: [`${location.origin}${local}/base/{z}/{x}/{y}.mvt`] } : { url: `pmtiles://${location.origin}${local}/remote-base.pmtiles` }), ...bounds, maxzoom: 13, attribution: '© OpenStreetMap contributors · Protomaps' },
      terrainSource: { type: 'raster-dem', tiles: [test.local ? `${location.origin}${local}/terrain/{z}/{x}/{y}.webp` : 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'], ...bounds, minzoom: 0, maxzoom: test.demZoom, tileSize: 512, encoding: 'terrarium', attribution: '© Mapterhorn' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#303d42' } },
      { id: 'earth', type: 'fill', source: 'base', 'source-layer': 'earth', paint: { 'fill-color': '#829078' } },
      { id: 'landuse', type: 'fill', source: 'base', 'source-layer': 'landuse', paint: { 'fill-color': '#64785e', 'fill-opacity': 0.3 } },
      { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#3b6374' } },
      { id: 'roads', type: 'line', source: 'base', 'source-layer': 'roads', paint: { 'line-color': '#c3b891', 'line-width': 1.2 } },
      { id: 'terrain-hillshade', type: 'hillshade', source: 'terrainSource', paint: { 'hillshade-shadow-color': '#182018', 'hillshade-highlight-color': '#c9d2b0', 'hillshade-exaggeration': 0.55 } },
    ],
    terrain: { source: 'terrainSource', exaggeration: 1.2 }, sky: {},
  };
}

export type BenchmarkResult = {
  id: string; name: string; round: number; weather: string; loadMs: number;
  renderFps: number; frameP95Ms: number; slowFrames: number; frames: number; durationMs: number;
  camera?: { longitude: number; latitude: number; zoom: number; pitch: number };
  canvas: string; tileErrors: number; status: '완료' | '실패' | '무효'; reason?: string;
};
export function frameSummary(intervals: number[], durationMs: number) {
  const sorted = [...intervals].sort((a, b) => a - b);
  return { renderFps: intervals.length * 1000 / durationMs, frameP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0, slowFrames: intervals.filter(ms => ms > 50).length, frames: intervals.length };
}
export function benchmarkVerdict(results: BenchmarkResult[]) {
  const valid = results.filter(r => r.status === '완료');
  const median = (id: string, key: 'renderFps' | 'loadMs') => {
    const numbers = valid.filter(r => r.id === id).map(r => r[key]).sort((a,b) => a-b);
    return numbers.length ? (numbers[Math.floor((numbers.length - 1) / 2)] + numbers[Math.floor(numbers.length / 2)]) / 2 : undefined;
  };
  const baseline = median('remote-world', 'renderFps'), bounded = median('remote-region', 'renderFps'), local = median('local-region', 'renderFps'), low = median('local-low', 'renderFps');
  if ([baseline,bounded,local,low].some(n => n === undefined)) return '네 조건의 유효한 측정이 모두 끝나면 결과를 비교합니다. 오류·백그라운드 전환이 있었던 측정은 제외합니다.';
  const percent = (a: number, b: number) => ((b / Math.max(a, .1) - 1) * 100).toFixed(1);
  const loadRemote = median('remote-region','loadMs')!, loadLocal = median('local-region','loadMs')!;
  return `렌더 FPS 변화: 범위 제한 ${percent(baseline!,bounded!)}%, 로컬 제공 ${percent(bounded!,local!)}%, 고도 축소 ${percent(local!,low!)}%. 로딩: 원격 ${(loadRemote/1000).toFixed(2)}초 → 로컬 ${(loadLocal/1000).toFixed(2)}초. ${low! > local! * 1.1 ? '고도 축소의 이점이 관찰됐습니다. 산 능선 품질을 함께 확인하세요.' : '고도 축소의 뚜렷한 FPS 이점은 관찰되지 않았습니다.'} 10% 이내의 차이는 반복 측정으로 확인하고, 범위 제한만으로 대폭 개선됐다고 판단하지 마세요.`;
}
