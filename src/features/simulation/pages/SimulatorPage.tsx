import { AtomicActionView } from '../components/AtomicActionView';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createInitialRuntimeState, SIMULATION_PLAYBACK_RATE } from '../lib/runtime';
import { getDeploymentById } from '../lib/deploymentStorage';
import { clampResultTime } from '../lib/playback';
import { getSimulationResult, getSimulationResultDeployment, getSimulationResultUnit, getSimulationResultUnits } from '../lib/simulationResultService';
import { getCommanderReports } from '../lib/unitAgent';
import { CommanderInbox } from '../components/CommanderInbox';
import { createUnitAgentRuntime } from '../lib/unitAgentRuntime';
import { ExitSimulationDialog } from '../components/ExitSimulationDialog';
import { PlaybackControls } from '../components/PlaybackControls';
import { SimulatorHeader } from '../components/SimulatorHeader';
import { TacticalMap } from '../components/TacticalMap';
import { UnitDetailPanel } from '../components/UnitDetailPanel';
import { UnitListPanel } from '../components/UnitListPanel';

export function SimulatorPage() {
  const { simulationId } = useParams();
  const navigate = useNavigate();
  const simulationResult = useMemo(() => getSimulationResult(simulationId), [simulationId]);
  const deployment = useMemo(
    // Paired result fixtures must win over an older browser copy with the same
    // deployment ID; otherwise normalized enemy designations can disappear.
    () => getSimulationResultDeployment(simulationResult.deploymentId ?? undefined)
      ?? (simulationResult.deploymentId ? getDeploymentById(simulationResult.deploymentId) : undefined),
    [simulationResult],
  );
  const rosterUnits = useMemo(() => getSimulationResultUnits(simulationResult, deployment), [deployment, simulationResult]);
  const agentRuntime = useMemo(
    () => createUnitAgentRuntime(simulationResult, deployment, rosterUnits.map(unit => unit.id)),
    [deployment, rosterUnits, simulationResult],
  );
  const commanderReports = useMemo(
    () => getCommanderReports(simulationResult, deployment),
    [deployment, simulationResult],
  );
  const [runtime, setRuntime] = useState(() => ({
    ...createInitialRuntimeState(),
    simulationTime: simulationResult.startTime,
    selectedUnitId: rosterUnits[0]?.id ?? '',
    playbackSpeed: 0.5,
  }));
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  const runtimeRef = useRef(runtime);
  const publishTimeRef = useRef(0);
  // This ref is the authoritative clock. React receives display snapshots only.
  const updateRuntime = useCallback((change: Partial<typeof runtime>) => {
    const next = { ...runtimeRef.current, ...change };
    runtimeRef.current = next;
    setRuntime(next);
  }, []);
  const selectedUnit = useMemo(
    () => getSimulationResultUnit(
      simulationResult,
      deployment,
      runtime.selectedUnitId,
      runtime.simulationTime,
      rosterUnits,
      agentRuntime.getState(runtime.selectedUnitId, runtime.simulationTime),
    ) ?? rosterUnits[0],
    [agentRuntime, deployment, rosterUnits, runtime.selectedUnitId, runtime.simulationTime, simulationResult],
  );

  const requestExit = () => {
    updateRuntime({ isPlaying: false });
    setExitDialogOpen(true);
  };

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
      if (!current.isPlaying) return;
      const nextTime = clampResultTime(
        simulationResult,
        current.simulationTime + deltaSeconds * current.playbackSpeed * SIMULATION_PLAYBACK_RATE,
      );

      const nextRuntime = {
        ...current,
        simulationTime: nextTime,
        isPlaying: nextTime < simulationResult.endTime,
      };
      agentRuntime.advanceTo(nextTime);
      runtimeRef.current = nextRuntime;
      // Panels do not need sixty React renders per second. The map reads the
      // authoritative ref on its own animation clock, including between renders.
      if (timestamp - publishTimeRef.current >= 100 || !nextRuntime.isPlaying) {
        publishTimeRef.current = timestamp;
        setRuntime(nextRuntime);
      }
    };

    const tick = (timestamp: number) => {
      advance(timestamp);
      if (runtimeRef.current.isPlaying) animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [agentRuntime, runtime.isPlaying, simulationResult]);

  const selectUnit = useCallback((selectedUnitId: string) => {
    updateRuntime({ selectedUnitId });
  }, [updateRuntime]);

  const setTacticalLayers = useCallback((tacticalLayers: typeof runtime.tacticalLayers) => {
    updateRuntime({ tacticalLayers });
  }, [updateRuntime]);

  const setSimulationTime = useCallback(
    (simulationTime: number) => {
      const nextTime = clampResultTime(simulationResult, simulationTime);
      agentRuntime.seekTo(nextTime);
      lastFrameTimeRef.current = undefined;
      updateRuntime({ simulationTime: nextTime });
    },
    [agentRuntime, simulationResult, updateRuntime],
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
        onTabChange={(activeTab) => updateRuntime({ activeTab })}
      />

      <div className="flex min-h-0 flex-1">
        <UnitListPanel
          units={rosterUnits}
          selectedUnitId={runtime.selectedUnitId}
          tacticalLayers={runtime.tacticalLayers}
          onSelectUnit={selectUnit}
          onLayerChange={setTacticalLayers}
        />
        {runtime.activeTab === 'order' ? (
          <CommanderInbox reports={commanderReports} simulationTime={runtime.simulationTime} onSelectUnit={selectUnit} />
        ) : (
          <TacticalMap
            runtime={runtime}
            playbackRef={runtimeRef}
            units={rosterUnits}
            result={simulationResult}
            deployment={deployment}
            onSelectUnit={selectUnit}
          />
        )}
        <aside className="w-[380px] shrink-0 overflow-y-auto border-l border-outline-variant bg-surface p-3">
          <AtomicActionView result={simulationResult} simulationTime={runtime.simulationTime} unitId={runtime.selectedUnitId} onSelectUnit={selectUnit} />
          {selectedUnit && <UnitDetailPanel unit={selectedUnit} />}
        </aside>
      </div>

      <PlaybackControls
        simulationTime={runtime.simulationTime}
        isPlaying={runtime.isPlaying}
        playbackSpeed={runtime.playbackSpeed}
        startTime={simulationResult.startTime}
        endTime={simulationResult.endTime}
        events={simulationResult.events}
        onTimeChange={setSimulationTime}
        onPlayingChange={(isPlaying) => updateRuntime({ isPlaying })}
        onSpeedChange={(playbackSpeed) => updateRuntime({ playbackSpeed })}
      />

      <ExitSimulationDialog
        open={exitDialogOpen}
        onCancel={() => setExitDialogOpen(false)}
        onExit={() => navigate('/simulations', { replace: true, state: { exitedSimulationId: simulationId } })}
      />
    </div>
  );
}
