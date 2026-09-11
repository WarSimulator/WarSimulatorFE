import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import type { SimulationRuntimeState } from '../../../types';

export function SimulatorPage() {
  const { simulationId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get('view') === 'analysis' ? 'analysis' : 'tactical';
  const isAnalysisView = viewMode === 'analysis';
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
  const [runtime, setRuntime] = useState<SimulationRuntimeState>(() => ({
    ...createInitialRuntimeState(),
    simulationTime: simulationResult.startTime,
    selectedUnitId: rosterUnits[0]?.id ?? '',
    playbackSpeed: 0.5,
    activeTab: isAnalysisView ? 'analysis' : 'map',
  }));
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  const runtimeRef = useRef(runtime);
  const publishTimeRef = useRef(0);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const syncSourceRef = useRef(crypto.randomUUID());
  const publishRuntime = useCallback((next: typeof runtime) => {
    syncChannelRef.current?.postMessage({ type: 'state', source: syncSourceRef.current, runtime: next });
  }, []);
  // This ref is the authoritative clock. React receives display snapshots only.
  const updateRuntime = useCallback((change: Partial<typeof runtime>) => {
    const next = { ...runtimeRef.current, ...change };
    runtimeRef.current = next;
    setRuntime(next);
    publishRuntime(next);
  }, [publishRuntime]);
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
  const currentActions = useMemo(() => Object.fromEntries(rosterUnits.map((unit) => {
    const effect = (simulationResult.actionEffects ?? []).find(item =>
      item.unitId === unit.id && item.startTime <= runtime.simulationTime && runtime.simulationTime < item.endTime,
    );
    if (effect) return [unit.id, effect.action];
    const segment = simulationResult.unitTracks.find(track => track.unitId === unit.id)?.segments.find(item =>
      item.startTime <= runtime.simulationTime && runtime.simulationTime < item.endTime,
    );
    return [unit.id, segment && segment.action.toLowerCase() !== 'hold' ? segment.action : '대기'];
  })), [rosterUnits, runtime.simulationTime, simulationResult]);

  useEffect(() => {
    const channel = new BroadcastChannel(`atlas-simulation-${simulationId ?? 'current'}`);
    syncChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type: string; source?: string; runtime?: typeof runtime }>) => {
      const message = event.data;
      if (message.source === syncSourceRef.current) return;
      if (message.type === 'request') {
        publishRuntime(runtimeRef.current);
        return;
      }
      if (message.type !== 'state' || !message.runtime) return;
      const next = {
        ...runtimeRef.current,
        ...message.runtime,
        activeTab: isAnalysisView ? 'analysis' as const : message.runtime.activeTab === 'order' ? 'order' as const : 'map' as const,
      };
      agentRuntime.seekTo(next.simulationTime);
      runtimeRef.current = next;
      setRuntime(next);
    };
    channel.postMessage({ type: 'request', source: syncSourceRef.current });
    return () => {
      channel.close();
      if (syncChannelRef.current === channel) syncChannelRef.current = null;
    };
  }, [agentRuntime, isAnalysisView, publishRuntime, simulationId]);

  const requestExit = () => {
    updateRuntime({ isPlaying: false });
    setExitDialogOpen(true);
  };

  useEffect(() => {
    if (!runtime.isPlaying || isAnalysisView) {
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
        publishRuntime(nextRuntime);
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
  }, [agentRuntime, isAnalysisView, publishRuntime, runtime.isPlaying, simulationResult]);

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
        viewMode={viewMode}
      />

      {isAnalysisView ? (
        <div className="flex min-h-0 flex-1">
          <UnitListPanel
            units={rosterUnits}
            selectedUnitId={runtime.selectedUnitId}
            tacticalLayers={runtime.tacticalLayers}
            onSelectUnit={selectUnit}
            onLayerChange={setTacticalLayers}
            actionsByUnitId={currentActions}
          />
          <main className="min-w-0 flex-1 overflow-y-auto bg-surface p-4">
            {selectedUnit && <UnitDetailPanel unit={selectedUnit} wide />}
          </main>
        </div>
      ) : (
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
        </div>
      )}

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
