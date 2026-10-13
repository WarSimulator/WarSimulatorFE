import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { SimulationRuntimeState } from '../../../types';
import { TacticalMap } from '../components/TacticalMap';
import { type FinalSimulationBuild } from '../lib/finalSimulation';
import { getSimulationResultUnits } from '../lib/simulationResultService';
import { createInitialRuntimeState } from '../lib/runtime';
import { BENCHMARK_BOUNDS, BENCHMARK_CASES, benchmarkStyle, benchmarkVerdict, frameSummary, type BenchmarkCase, type BenchmarkResult } from '../lib/mapBenchmark';
import { getMapEnvironment, updateMapEnvironment } from '../lib/mapEnvironment';

const SAMPLE_MS = 10000;
const WARMUP_MS = 3000;
const buttonClass = 'rounded border border-outline-variant bg-surface-container px-3 py-2 text-xs text-on-surface hover:border-secondary disabled:opacity-40';
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export function MapLibreBenchmarkPage() {
  const [build, setBuild] = useState<FinalSimulationBuild>();
  const [error, setError] = useState('');
  const [test, setTest] = useState<BenchmarkCase>(BENCHMARK_CASES[2]);
  const [mapKey, setMapKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('테스트 데이터를 준비하고 있습니다.');
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [rounds, setRounds] = useState(2);
  const [weather, setWeather] = useState<'clear' | 'snow' | 'rain'>('clear');
  const [manifest, setManifest] = useState<{ summary: Record<string, { bytes: number; tiles: number }> }>();
  const mapRef = useRef<MapLibreMap | null>(null);
  const runToken = useRef(0);
  const rejectReady = useRef<((reason?: string) => void) | null>(null);
  const readyResolver = useRef<((map: MapLibreMap) => void) | null>(null);
  const runtimeRef = useRef<SimulationRuntimeState>(createInitialRuntimeState());
  const runtime = useMemo(() => createInitialRuntimeState(), []);
  const onReady = useCallback((map: MapLibreMap) => {
    map.jumpTo({ center: [127.44, 38.44], zoom: 12, pitch: 60, bearing: -12 });
    mapRef.current = map;
    readyResolver.current?.(map);
    readyResolver.current = null;
  }, []);
  const onMapError = useCallback((message: string) => { setError(message); rejectReady.current?.(message); }, []);
  const benchmark = useMemo(() => ({ style: benchmarkStyle(test), bounds: test.bounded ? [[BENCHMARK_BOUNDS[0], BENCHMARK_BOUNDS[1]], [BENCHMARK_BOUNDS[2], BENCHMARK_BOUNDS[3]]] as [[number, number], [number, number]] : undefined, onReady, onError: onMapError }), [test, onReady, onMapError]);
  const units = useMemo(() => build ? getSimulationResultUnits(build.result, build.deployment) : [], [build]);
  useEffect(() => {
    let cancelled = false;
    const previousEnvironment = getMapEnvironment();
    updateMapEnvironment({ weather: 'clear', time: 'day' });
    void Promise.all([
      fetch(`${import.meta.env.BASE_URL}map-benchmark/simulation.json`).then(response => { if (!response.ok) throw new Error('VER1 테스트 패키지가 없습니다. npm run prepare:map-benchmark를 실행하세요.'); return response.json() as Promise<FinalSimulationBuild>; }),
      fetch(`${import.meta.env.BASE_URL}map-benchmark/manifest.json`).then(response => { if (!response.ok) throw new Error('로컬 지도 데이터를 준비해야 합니다. npm run prepare:map-benchmark를 실행하세요.'); return response.json(); }),
    ]).then(([nextBuild, nextManifest]) => {
      if (cancelled) return;
      runtimeRef.current = { ...runtime, simulationTime: nextBuild.result.startTime };
      setBuild(nextBuild); setManifest(nextManifest); setPhase('비교할 조건을 선택하거나 전체 비교를 시작하세요.');
    }).catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught)); });
    return () => { cancelled = true; runToken.current++; updateMapEnvironment(previousEnvironment); };
  }, [runtime]);

  const execute = async (cases: readonly BenchmarkCase[]) => {
    if (!build || running) return;
    const token = ++runToken.current;
    setRunning(true); setResults([]); setError('');
    updateMapEnvironment({ weather, time: 'day' });
    const isCurrent = () => token === runToken.current;
    try {
      for (let round = 1; round <= rounds && isCurrent(); round++) {
        // Reverse the second pass to reduce fixed-order/cache bias.
        const ordered = round % 2 ? cases : [...cases].reverse();
        for (const current of ordered) {
          if (!isCurrent()) break;
          setPhase(`${round}/${rounds}회 · ${current.name} · 지도 준비`);
          runtimeRef.current = { ...runtime, simulationTime: build.result.startTime };
          mapRef.current = null;
          const loadStart = performance.now();
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const ready = new Promise<MapLibreMap>((resolve, reject) => {
            readyResolver.current = resolve;
            rejectReady.current = reason => reject(new Error(reason ?? '측정을 중지했습니다.'));
            timeout = setTimeout(() => reject(new Error('지도 준비 시간 초과 (45초)')), 45000);
          });
          setError(''); setTest(current); setMapKey(key => key + 1);
          let map: MapLibreMap;
          try { map = await ready; }
          catch (caught) {
            if (isCurrent()) setResults(rows => [...rows, { id: current.id, name: current.name, round, weather, loadMs: performance.now() - loadStart, renderFps: 0, frameP95Ms: 0, slowFrames: 0, frames: 0, durationMs: 0, canvas: '', tileErrors: 1, status: '실패', reason: String(caught) }]);
            continue;
          } finally { clearTimeout(timeout); readyResolver.current = null; rejectReady.current = null; }
          let tileErrors = 0;
          const onError = () => { tileErrors++; };
          map.on('error', onError);
          const deadline = performance.now() + 45000;
          while (isCurrent() && !map.areTilesLoaded() && performance.now() < deadline) await wait(150);
          if (!isCurrent()) { map.off('error', onError); break; }
          const loadMs = performance.now() - loadStart;
          setPhase(`${round}/${rounds}회 · ${current.name} · 워밍업 ${WARMUP_MS / 1000}초`);
          // Prime the same camera path, then wait for its tiles before sampling.
          const warmStart = performance.now();
          while (isCurrent() && performance.now() - warmStart < WARMUP_MS) {
            const progress = (performance.now() - warmStart) / WARMUP_MS;
            map.jumpTo({ center: [127.44, 38.44], zoom: 12, pitch: 60, bearing: -12 + Math.sin(progress * Math.PI * 2) * 10 });
            await wait(100);
          }
          map.jumpTo({ center: [127.44, 38.44], zoom: 12, pitch: 60, bearing: -12 });
          const warmDeadline = performance.now() + 45000;
          let stableSince = performance.now();
          while (isCurrent() && performance.now() < warmDeadline) {
            if (!map.areTilesLoaded()) stableSince = performance.now();
            else if (performance.now() - stableSince >= 500) break;
            await wait(100);
          }
          if (!isCurrent()) { map.off('error', onError); break; }
          const tilesReady = map.areTilesLoaded();
          const initialCenter = map.getCenter();
          const initialZoom = map.getZoom();
          const intervals: number[] = [];
          let lastRender: number | undefined, backgrounded = document.hidden;
          const onVisibility = () => { if (document.hidden) backgrounded = true; };
          const onRender = () => { const now = performance.now(); if (lastRender !== undefined) intervals.push(now - lastRender); lastRender = now; };
          document.addEventListener('visibilitychange', onVisibility); map.on('render', onRender);
          setPhase(`${round}/${rounds}회 · ${current.name} · 동일한 VER1 재생·카메라 경로 측정 ${SAMPLE_MS / 1000}초`);
          const start = performance.now();
          let frame = 0;
          await new Promise<void>(resolve => {
            const tick = (timestamp: number) => {
              if (!isCurrent() || timestamp - start >= SAMPLE_MS) { resolve(); return; }
              const progress = Math.max(0, (timestamp - start) / SAMPLE_MS);
              runtimeRef.current = { ...runtime, isPlaying: true, simulationTime: build.result.startTime + (build.result.endTime - build.result.startTime) * progress };
              map.jumpTo({ center: initialCenter, zoom: initialZoom, pitch: 60, bearing: -12 + Math.sin(progress * Math.PI * 2) * 10 });
              frame = requestAnimationFrame(tick);
            };
            frame = requestAnimationFrame(tick);
          });
          cancelAnimationFrame(frame);
          runtimeRef.current = { ...runtimeRef.current, isPlaying: false };
          const durationMs = performance.now() - start;
          map.off('render', onRender); map.off('error', onError); document.removeEventListener('visibilitychange', onVisibility);
          if (!isCurrent()) break;
          const canvas = map.getCanvas();
          const reasons = [backgrounded ? '백그라운드 전환' : '', tileErrors ? `타일 오류 ${tileErrors}건` : '', !tilesReady ? '카메라 경로 타일 준비 미완료' : '', durationMs > SAMPLE_MS * 1.5 ? `측정 지연 ${(durationMs / 1000).toFixed(1)}초` : ''].filter(Boolean);
          const status = reasons.length ? '무효' : '완료';
          setResults(rows => [...rows, { id: current.id, name: current.name, round, weather, loadMs, ...frameSummary(intervals, durationMs), durationMs, camera: { longitude: initialCenter.lng, latitude: initialCenter.lat, zoom: initialZoom, pitch: 60 }, canvas: `${canvas.width}×${canvas.height}`, tileErrors, status, reason: reasons.length ? reasons.join(' · ') : undefined }]);
        }
      }
    } catch (caught) { if (isCurrent()) setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { if (token === runToken.current || token + 1 === runToken.current) { setRunning(false); if (isCurrent()) setPhase('측정이 끝났습니다. 결과와 지형 품질을 함께 비교하세요.'); } }
  };
  const stop = () => { runToken.current++; rejectReady.current?.(); runtimeRef.current = { ...runtimeRef.current, isPlaying: false }; setPhase('측정을 중지했습니다. 진행 중인 결과는 저장하지 않습니다.'); };
  const download = () => {
    const blob = new Blob([JSON.stringify({ measuredAt: new Date().toISOString(), userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dataset: manifest, results, verdict: benchmarkVerdict(results) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'maplibre-benchmark.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="flex h-full min-h-0 flex-col gap-3 p-4 text-on-surface">
    <header className="shrink-0 space-y-2">
      <h2 className="font-label-caps text-lg">MAPLIBRE 지역·로컬 지도 성능 테스트</h2>
      <p className="text-xs text-on-surface-variant">철원 주변 약 50km · 동일한 Protomaps 배경 지도 / VER1 시뮬레이션 / 카메라 경로 · 고도 z12와 z10 비교. 기존 OSM 이미지 지도와의 절대 성능 비교는 아닙니다.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="비교 조건" className={buttonClass} disabled={running} value={test.id} onChange={event => { setTest(BENCHMARK_CASES.find(c => c.id === event.target.value)!); setMapKey(key => key + 1); }}>
          {BENCHMARK_CASES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="측정 날씨" className={buttonClass} disabled={running} value={weather} onChange={event => { const next = event.target.value as typeof weather; setWeather(next); updateMapEnvironment({ weather: next }); }}><option value="clear">맑음</option><option value="snow">눈</option><option value="rain">비</option></select>
        <select aria-label="반복 횟수" className={buttonClass} disabled={running} value={rounds} onChange={e => setRounds(Number(e.target.value))}><option value={1}>1회</option><option value={2}>2회 (순서 반전)</option><option value={3}>3회</option></select>
        <button className={buttonClass} disabled={!build || running} onClick={() => void execute(BENCHMARK_CASES)}>전체 비교 시작</button>
        <button className={buttonClass} disabled={!build || running} onClick={() => void execute([test])}>선택 조건 측정</button>
        <button className={buttonClass} disabled={!running} onClick={stop}>중지</button>
        <button className={buttonClass} disabled={!results.length || running} onClick={download}>결과 JSON 저장</button>
      </div>
      <p role="status" className="text-xs text-secondary">{phase}</p>
      {manifest && <p className="text-[11px] text-on-surface-variant">로컬 데이터: {Object.entries(manifest.summary).map(([name, data]) => `${name === 'base' ? '배경' : '고도'} ${(data.bytes / 1048576).toFixed(2)}MB / ${data.tiles}타일`).join(' · ')}. 로컬 조건의 지도·시뮬레이션 데이터는 외부망 없이 제공. 원격 조건은 인터넷 및 개발·미리보기 서버 필요 (배경 지도는 서버 중계).</p>}
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </header>
    <section className={`relative flex min-h-[280px] flex-1 overflow-hidden rounded border border-outline-variant ${running ? 'pointer-events-none' : ''}`}>
      {build && <TacticalMap key={`${test.id}:${mapKey}`} runtime={runtime} playbackRef={runtimeRef} units={units} result={build.result} deployment={build.deployment} onSelectUnit={() => {}} terrain3D benchmark={benchmark} />}
    </section>
    <section className="h-[240px] shrink-0 overflow-auto rounded border border-outline-variant bg-surface-container p-3 text-xs">
      <p className="mb-2 text-on-surface-variant">렌더 FPS는 실제 지도 render 이벤트 기준이며 GPU 실행 시간과는 다릅니다. p95는 지도 프레임 간격입니다. 로딩은 브라우저 캐시 영향을 받으므로 반복 결과와 함께 판단하세요.</p>
      <table className="w-full text-left"><thead><tr className="text-secondary"><th>조건</th><th>회차</th><th>로딩</th><th>렌더 FPS</th><th>p95</th><th>50ms 초과</th><th>오류</th><th>상태</th></tr></thead><tbody>{results.map((row,i) => <tr key={i} className="border-t border-outline-variant"><td className="py-1">{row.name}</td><td>{row.round}</td><td>{(row.loadMs/1000).toFixed(2)}초</td><td>{row.renderFps.toFixed(1)}</td><td>{row.frameP95Ms.toFixed(1)}ms</td><td>{row.slowFrames}</td><td>{row.tileErrors}</td><td title={row.reason}>{row.status}</td></tr>)}</tbody></table>
      <p className="mt-3 text-secondary">{benchmarkVerdict(results)}</p>
    </section>
  </div>;
}
