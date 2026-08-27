import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createInitialRuntimeState, SIMULATION_PLAYBACK_RATE } from '../lib/runtime';
import { getDeploymentById } from '../lib/deploymentStorage';
import { clampResultTime } from '../lib/playback';
import { getMoveSimulationResult, getSimulationResultUnits } from '../lib/simulationResultService';
import { ExitSimulationDialog } from '../components/ExitSimulationDialog';
import { PlaybackControls } from '../components/PlaybackControls';
import { SimulatorHeader } from '../components/SimulatorHeader';
import { TacticalMap } from '../components/TacticalMap';
import { UnitDetailPanel } from '../components/UnitDetailPanel';
import { UnitListPanel } from '../components/UnitListPanel';

export function SimulatorPage() {
  const { simulationId } = useParams();
  const navigate = useNavigate();
  const simulationResult = useMemo(() => getMoveSimulationResult(), []);
  const deployment = useMemo(
    () => (simulationResult.deploymentId ? getDeploymentById(simulationResult.deploymentId) : undefined),
    [simulationResult],
  );
  const resultUnits = useMemo(() => getSimulationResultUnits(simulationResult, deployment), [deployment, simulationResult]);
  const [runtime, setRuntime] = useState(() => ({
    ...createInitialRuntimeState(),
    simulationTime: simulationResult.startTime,
    selectedUnitId: simulationResult.unitTracks[0]?.unitId ?? '',
    playbackSpeed: 0.5,
  }));
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  const runtimeRef = useRef(runtime);
  const selectedUnit = useMemo(
    () => resultUnits.find((unit) => unit.id === runtime.selectedUnitId) ?? resultUnits[0],
    [resultUnits, runtime.selectedUnitId],
  );

  const requestExit = () => {
    setRuntime((current) => ({ ...current, isPlaying: false }));
    setExitDialogOpen(true);
  };

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    if (!runtime.isPlaying) {
      lastFrameTimeRef.current = undefined;
      return;
    }

    let animationFrameId = 0;
    const advance = (timestamp: number) => {
      const previousTimestamp = lastFrameTimeRef.current ?? timestamp;
      const deltaSeconds = Math.max(0, timestamp - previousTimestamp) / 1000;
      lastFrameTimeRef.current = Math.max(previousTimestamp, timestamp);
      const current = runtimeRef.current;
      const nextTime = clampResultTime(
        simulationResult,
        current.simulationTime + deltaSeconds * current.playbackSpeed * SIMULATION_PLAYBACK_RATE,
      );

      const nextRuntime = {
        ...current,
        simulationTime: nextTime,
        isPlaying: nextTime < simulationResult.endTime,
      };
      runtimeRef.current = nextRuntime;
      setRuntime(nextRuntime);
    };

    const tick = (timestamp: number) => {
      advance(timestamp);
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [runtime.isPlaying, simulationResult]);

  const selectUnit = useCallback((selectedUnitId: string) => {
    setRuntime((current) => ({ ...current, selectedUnitId }));
  }, []);

  const setSimulationTime = useCallback(
    (simulationTime: number) => {
      setRuntime((current) => ({ ...current, simulationTime: clampResultTime(simulationResult, simulationTime) }));
    },
    [simulationResult],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    window.history.pushState({ simulatorGuard: true }, '');

    const handlePopState = () => {
      requestExit();
      window.history.pushState({ simulatorGuard: true }, '');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface text-on-surface">
      <SimulatorHeader
        runtime={runtime}
        onExit={requestExit}
        onTabChange={(activeTab) => setRuntime((current) => ({ ...current, activeTab }))}
      />

      <div className="flex min-h-0 flex-1">
        <UnitListPanel
          units={resultUnits}
          selectedUnitId={runtime.selectedUnitId}
          tacticalLayers={runtime.tacticalLayers}
          onSelectUnit={selectUnit}
          onLayerChange={(tacticalLayers) => setRuntime((current) => ({ ...current, tacticalLayers }))}
        />
        <TacticalMap
          runtime={runtime}
          units={resultUnits}
          result={simulationResult}
          onSelectUnit={selectUnit}
        />
        {selectedUnit && <UnitDetailPanel unit={selectedUnit} />}
      </div>

      <PlaybackControls
        simulationTime={runtime.simulationTime}
        isPlaying={runtime.isPlaying}
        playbackSpeed={runtime.playbackSpeed}
        startTime={simulationResult.startTime}
        endTime={simulationResult.endTime}
        events={simulationResult.events}
        onTimeChange={setSimulationTime}
        onPlayingChange={(isPlaying) => setRuntime((current) => ({ ...current, isPlaying }))}
        onSpeedChange={(playbackSpeed) => setRuntime((current) => ({ ...current, playbackSpeed }))}
      />

      <ExitSimulationDialog
        open={exitDialogOpen}
        onCancel={() => setExitDialogOpen(false)}
        onExit={() => navigate('/simulations', { replace: true, state: { exitedSimulationId: simulationId } })}
      />
    </div>
  );
}
