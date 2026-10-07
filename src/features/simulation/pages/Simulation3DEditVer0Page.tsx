import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { DeploymentEditorMode, DeploymentSetup, SimulationResultPosition, SimulationRuntimeState } from '../../../types';
import { Icon } from '../../../components/layout/Icon';
import { DeploymentMap } from '../components/DeploymentMap';
import { MapLibre3DTacticalMap } from '../components/MapLibre3DTacticalMap';
import { PlaybackControls } from '../components/PlaybackControls';
import { SymbolPalette } from '../components/SymbolPalette';
import { Ver0CommandPanel } from '../components/Ver0CommandPanel';
import { createEmptyDeployment } from '../lib/deploymentStorage';
import { buildVer0Simulation, validateVer0Commands, type Ver0Command } from '../lib/ver0Simulation';

const STORAGE_KEY = 'atlas-defense.simulation-3d-edit-ver0';

type SavedDraft = { deployment: DeploymentSetup; commands: Ver0Command[] };

function loadDraft(): SavedDraft {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedDraft | null;
    if (saved?.deployment?.units && Array.isArray(saved.commands)) return saved;
  } catch {
    // Start with a clean draft if an older browser draft is invalid.
  }
  return { deployment: createEmptyDeployment('ver0-local', 'Mil-Simulator 3D EDIT (ver0)'), commands: [] };
}

function initialRuntime(selectedUnitId = ''): SimulationRuntimeState {
  return {
    simulationTime: 0, isPlaying: false, playbackSpeed: 1, selectedUnitId,
    activeTab: 'map', tacticalLayers: { routes: true, controlLines: true, labels: true },
    worldClockCountryCode: 'KR',
  };
}

export function Simulation3DEditVer0Page() {
  const initial = useMemo(loadDraft, []);
  const [deployment, setDeployment] = useState(initial.deployment);
  const [commands, setCommands] = useState(initial.commands);
  const [mode, setMode] = useState<DeploymentEditorMode>({ type: 'select' });
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [selectedCommandUnitId, setSelectedCommandUnitId] = useState<string>(initial.deployment.units[0]?.id ?? '');
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [runtime, setRuntime] = useState<SimulationRuntimeState>(() => initialRuntime(initial.deployment.units[0]?.id));
  const [mapPickTarget, setMapPickTarget] = useState<'from' | 'to'>();
  const [pickedMapPoint, setPickedMapPoint] = useState<{ target: 'from' | 'to'; position: SimulationResultPosition; revision: number }>();
  const [commandEndpoints, setCommandEndpoints] = useState<{ from: SimulationResultPosition; to: SimulationResultPosition }>();
  const runtimeRef = useRef(runtime);
  const pickRevisionRef = useRef(0);
  const lastFrameRef = useRef<number | undefined>(undefined);
  const publishRef = useRef(0);
  const compiled = useMemo(() => buildVer0Simulation(deployment, commands), [commands, deployment]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ deployment, commands } satisfies SavedDraft)); } catch { /* Keep the current session usable. */ }
  }, [commands, deployment]);
  useEffect(() => {
    setCommands(current => current.filter(command => deployment.units.some(unit => unit.id === command.unitId)
      && (command.kind === 'action' || deployment.tacticalGraphics.some(graphic => graphic.id === command.graphicId))));
    if (selectedCommandUnitId && !deployment.units.some(unit => unit.id === selectedCommandUnitId)) {
      setSelectedCommandUnitId(deployment.units[0]?.id ?? '');
    }
  }, [deployment.units, deployment.tacticalGraphics, selectedCommandUnitId]);

  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);
  useEffect(() => {
    if (!running || !runtime.isPlaying) { lastFrameRef.current = undefined; return; }
    let frame = 0;
    const tick = (timestamp: number) => {
      const previous = lastFrameRef.current ?? timestamp;
      lastFrameRef.current = timestamp;
      const current = runtimeRef.current;
      if (!current.isPlaying) return;
      const nextTime = Math.min(compiled.result.endTime, current.simulationTime + Math.max(0, timestamp - previous) / 1000 * current.playbackSpeed);
      const next = { ...current, simulationTime: nextTime, isPlaying: nextTime < compiled.result.endTime };
      runtimeRef.current = next;
      if (timestamp - publishRef.current > 80 || !next.isPlaying) { publishRef.current = timestamp; setRuntime(next); }
      if (next.isPlaying) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [compiled.result.endTime, running, runtime.isPlaying]);

  const updateRuntime = (change: Partial<SimulationRuntimeState>) => {
    const next = { ...runtimeRef.current, ...change };
    runtimeRef.current = next; setRuntime(next);
  };
  const changeMapPickTarget = useCallback((target?: 'from' | 'to') => {
    setMapPickTarget(target);
    if (target) {
      setMode({ type: 'select' });
      setSelectedEntityId(undefined);
      setPaletteOpen(false);
    }
  }, []);
  const selectCommandPoint = useCallback((position: SimulationResultPosition) => {
    if (!mapPickTarget) return;
    pickRevisionRef.current += 1;
    setPickedMapPoint({ target: mapPickTarget, position, revision: pickRevisionRef.current });
    setMapPickTarget(undefined);
  }, [mapPickTarget]);
  const commandPoints = useMemo(() => commandEndpoints ? {
    ...commandEndpoints,
    active: mapPickTarget,
    onSelect: selectCommandPoint,
  } : undefined, [commandEndpoints, mapPickTarget, selectCommandPoint]);
  const start = () => {
    const issue = validateVer0Commands(deployment, commands);
    if (issue) { setError(issue); return; }
    const next = initialRuntime(deployment.units[0]?.id);
    next.isPlaying = true;
    runtimeRef.current = next;
    setRuntime(next);
    setError('');
    setMapPickTarget(undefined);
    setRunning(true);
  };
  const reset = () => {
    const fresh = createEmptyDeployment('ver0-local', 'Mil-Simulator 3D EDIT (ver0)');
    setDeployment(fresh); setCommands([]); setSelectedEntityId(undefined); setSelectedCommandUnitId('');
    setMode({ type: 'select' }); setRunning(false); setError(''); setMapPickTarget(undefined); setCommandEndpoints(undefined);
  };

  if (running) return <section className="flex h-[calc(100vh-80px)] min-h-0 flex-col overflow-hidden bg-surface">
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-high px-5">
      <div><p className="font-label-caps text-[10px] text-secondary">MIL-SIMULATOR 3D EDIT (ver0)</p><h2 className="text-base font-semibold text-on-surface">ASSIGNED COMMAND EXECUTION</h2></div>
      <div className="flex items-center gap-2">
        <span className="rounded border border-outline-variant px-3 py-1.5 font-data-mono text-[11px] text-on-surface-variant">유닛 {deployment.units.length} · 명령 {commands.length}</span>
        <button type="button" onClick={() => { updateRuntime({ isPlaying: false }); setRunning(false); }} className="rounded border border-secondary px-4 py-2 text-xs font-bold text-secondary">편집으로 돌아가기</button>
      </div>
    </header>
    <div className="relative flex min-h-0 flex-1">
      <MapLibre3DTacticalMap
        runtime={runtime} playbackRef={runtimeRef} units={compiled.units} result={compiled.result} deployment={deployment}
        onSelectUnit={unitId => updateRuntime({ selectedUnitId: unitId })}
      />
      <div className="pointer-events-none absolute left-4 top-4 z-30 rounded border border-primary/50 bg-surface/90 px-3 py-2 backdrop-blur">
        <p className="font-data-mono text-[10px] text-primary">LIVE COMMAND PLAN</p>
        <p className="mt-1 text-xs text-on-surface">할당된 DRAW·전술과업·ACTION을 시간순으로 실행 중</p>
      </div>
    </div>
    <PlaybackControls
      simulationTime={runtime.simulationTime} isPlaying={runtime.isPlaying} playbackSpeed={runtime.playbackSpeed}
      startTime={compiled.result.startTime} endTime={compiled.result.endTime} events={compiled.result.events}
      onTimeChange={simulationTime => updateRuntime({ simulationTime, isPlaying: false })}
      onPlayingChange={isPlaying => updateRuntime({ isPlaying })}
      onSpeedChange={playbackSpeed => updateRuntime({ playbackSpeed })}
    />
  </section>;

  return <section className="flex h-[calc(100vh-80px)] min-h-0 flex-col overflow-hidden bg-surface">
    <header className="flex h-[76px] shrink-0 items-center justify-between gap-5 border-b border-outline-variant bg-surface-container-high px-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded border border-secondary/50 bg-secondary/10"><Icon name="edit_location_alt" className="text-secondary" filled /></span>
        <div><h1 className="text-lg font-semibold text-primary">Mil-Simulator 3D EDIT (ver0)</h1><p className="mt-0.5 text-xs text-on-surface-variant">배치 → DRAW·전술과업·ACTION 할당 → START 실행</p></div>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded border border-outline-variant px-3 py-2 font-data-mono text-[10px] text-on-surface-variant">유닛 {deployment.units.length} · 도형 {deployment.tacticalGraphics.length} · 명령 {commands.length}</span>
        <button type="button" onClick={reset} className="rounded border border-outline-variant px-3 py-2 text-xs text-on-surface-variant hover:bg-surface-variant">새 작전</button>
        <button type="button" onClick={start} className="flex items-center gap-2 rounded bg-secondary px-5 py-2 text-xs font-bold text-on-secondary hover:bg-secondary-container"><Icon name="play_arrow" className="text-[18px]" filled />START</button>
      </div>
    </header>
    {error && <div role="alert" className="shrink-0 border-b border-error/40 bg-error/10 px-5 py-2 text-xs text-error">{error}</div>}
    <div className="relative min-h-0 flex-1" style={{ '--palette-width': 'min(590px, calc(100vw - 680px))', '--map-controls-left': paletteOpen ? 'calc(var(--palette-width) + 32px)' : '72px' } as CSSProperties}>
      <DeploymentMap deployment={deployment} selectedEntityId={selectedEntityId} mode={mode} terrain3D commandPoints={commandPoints}
        onChange={setDeployment} onSelectEntity={entityId => {
          setSelectedEntityId(entityId);
          if (entityId && deployment.units.some(unit => unit.id === entityId)) setSelectedCommandUnitId(entityId);
        }} onModeChange={setMode} />
      <SymbolPalette mode={mode} onModeChange={next => { setMode(next); if (next.type !== 'select') setSelectedEntityId(undefined); }} isOpen={paletteOpen} onToggle={() => setPaletteOpen(value => !value)} compact />
      <Ver0CommandPanel deployment={deployment} selectedUnitId={selectedCommandUnitId} commands={commands}
        onSelectUnit={unitId => { setSelectedCommandUnitId(unitId); setSelectedEntityId(unitId); setMode({ type: 'select' }); }} onChange={setCommands}
        mapPickTarget={mapPickTarget} pickedMapPoint={pickedMapPoint} onMapPickTargetChange={changeMapPickTarget} onEndpointsChange={setCommandEndpoints} />
    </div>
  </section>;
}
