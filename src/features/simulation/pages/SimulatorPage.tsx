import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createInitialRuntimeState, SIMULATION_PLAYBACK_RATE } from '../lib/runtime';
import { createGeoPosition } from '../lib/position';
import { loadHiddenLiveEditUnitIds, loadLiveEditObjects, loadLiveEditUnits, saveHiddenLiveEditUnitIds, saveLiveEditObjects, saveLiveEditUnits } from '../lib/liveEditUnits';
import { getDeploymentById } from '../lib/deploymentStorage';
import { clampResultTime, isUnitEliminated } from '../lib/playback';
import { getSimulationResult, getSimulationResultDeployment, getSimulationResultUnit, getSimulationResultUnits } from '../lib/simulationResultService';
import { getFinalSimulationReport } from '../lib/finalSimulation';
import { getCommanderReports } from '../lib/unitAgent';
import { CommanderInbox } from '../components/CommanderInbox';
import { createUnitAgentRuntime } from '../lib/unitAgentRuntime';
import { ExitSimulationDialog } from '../components/ExitSimulationDialog';
import { PlaybackControls } from '../components/PlaybackControls';
import { SimulatorHeader } from '../components/SimulatorHeader';
import { TacticalMap } from '../components/TacticalMap';
import { Google3DTacticalMap } from '../components/Google3DTacticalMap';
import { UnitDetailPanel } from '../components/UnitDetailPanel';
import { UnitListPanel } from '../components/UnitListPanel';
import { SimulationCompatibilityReport } from '../components/SimulationCompatibilityReport';
import type { DeploymentEditorMode, DeploymentObjective, DeploymentPaletteItem, DeploymentSetup, DeploymentUnit, SimulationRuntimeState, TacticalGraphic } from '../../../types';

export function SimulatorPage() {
  const { simulationId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get('view') === 'analysis' ? 'analysis' : 'tactical';
  const mapMode = searchParams.get('map') === '3d' ? '3d' : '2d';
  const atomicActionVisuals = searchParams.get('visualization') === 'atomic3d';
  const liveEditMode = mapMode === '3d' && searchParams.get('edit') === 'live';
  const isAnalysisView = viewMode === 'analysis';
  const simulationResult = useMemo(() => getSimulationResult(simulationId), [simulationId]);
  const compatibilityReport = useMemo(() => getFinalSimulationReport(simulationId), [simulationId]);
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
  const [liveUnits, setLiveUnits] = useState<DeploymentUnit[]>(() => liveEditMode ? loadLiveEditUnits(simulationId) : []);
  const [hiddenBaseUnitIds, setHiddenBaseUnitIds] = useState<string[]>(() => liveEditMode ? loadHiddenLiveEditUnitIds(simulationId) : []);
  const [liveObjects, setLiveObjects] = useState(() => liveEditMode ? loadLiveEditObjects(simulationId) : { objectives: [] as DeploymentObjective[], tacticalGraphics: [] as TacticalGraphic[] });
  const [liveEditorMode, setLiveEditorMode] = useState<DeploymentEditorMode>({ type: 'select' });
  const [livePaletteOpen, setLivePaletteOpen] = useState(false);
  const [selectedLiveUnitId, setSelectedLiveUnitId] = useState<string>();
  const [relocatingUnitId, setRelocatingUnitId] = useState<string>();
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  const runtimeRef = useRef(runtime);
  const publishTimeRef = useRef(0);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const syncSourceRef = useRef(crypto.randomUUID());
  useEffect(() => {
    if (liveEditMode) saveLiveEditUnits(simulationId, liveUnits);
  }, [liveEditMode, liveUnits, simulationId]);
  useEffect(() => {
    if (liveEditMode) saveHiddenLiveEditUnitIds(simulationId, hiddenBaseUnitIds);
  }, [hiddenBaseUnitIds, liveEditMode, simulationId]);
  useEffect(() => {
    if (liveEditMode) saveLiveEditObjects(simulationId, liveObjects);
  }, [liveEditMode, liveObjects, simulationId]);

  const placeLiveUnit = useCallback((item: Extract<DeploymentPaletteItem, { kind: 'unit' }>, location: { lng: number; lat: number }) => {
    const id = `unit-${crypto.randomUUID()}`;
    setLiveUnits(current => {
      const existing = [...(deployment?.units ?? []), ...current];
      const count = existing.filter(unit => unit.affiliation === item.affiliation && unit.unitType === item.unitType).length + 1;
      const designation = `${item.affiliation === 'friendly' ? 'Friendly' : 'Enemy'} ${item.label.split(' / ').at(-1)} ${count}`;
      return [...current, {
        id, designation, affiliation: item.affiliation, unitType: item.unitType, echelon: item.echelon,
        sidc: item.sidc, symbolStandard: item.symbolStandard ?? '2525', position: createGeoPosition(location.lng, location.lat),
      }];
    });
    setSelectedLiveUnitId(id);
    setLiveEditorMode({ type: 'select' });
  }, [deployment]);

  const changeLiveDeployment = useCallback((next: DeploymentSetup) => {
    const id = selectedLiveUnitId;
    if (!id) return;
    if (liveObjects.objectives.some(objective => objective.id === id)) {
      setLiveObjects(current => ({ ...current, objectives: next.objectives.filter(objective => current.objectives.some(item => item.id === objective.id)) }));
      return;
    }
    if (liveObjects.tacticalGraphics.some(graphic => graphic.id === id)) {
      setLiveObjects(current => ({ ...current, tacticalGraphics: next.tacticalGraphics.filter(graphic => current.tacticalGraphics.some(item => item.id === graphic.id)) }));
      return;
    }
    const updated = next.units.find(unit => unit.id === id);
    const isBaseUnit = deployment?.units.some(unit => unit.id === id) ?? false;
    if (updated) {
      setLiveUnits(current => [...current.filter(unit => unit.id !== id), updated]);
    } else {
      setLiveUnits(current => current.filter(unit => unit.id !== id));
      if (isBaseUnit) setHiddenBaseUnitIds(current => current.includes(id) ? current : [...current, id]);
      setRelocatingUnitId(undefined);
    }
  }, [deployment, liveObjects, selectedLiveUnitId]);

  const placeLiveObjective = useCallback((location: { lng: number; lat: number }) => {
    const id = `objective-${crypto.randomUUID()}`;
    setLiveObjects(current => ({ ...current, objectives: [...current.objectives, { id, name: `Objective ${(deployment?.objectives.length ?? 0) + current.objectives.length + 1}`, position: createGeoPosition(location.lng, location.lat) }] }));
    setSelectedLiveUnitId(id);
    setLiveEditorMode({ type: 'select' });
  }, [deployment]);

  const addLiveGraphic = useCallback((graphic: TacticalGraphic) => {
    setLiveObjects(current => ({ ...current, tacticalGraphics: [...current.tacticalGraphics, graphic] }));
    setSelectedLiveUnitId(graphic.id);
    setLiveEditorMode({ type: 'select' });
  }, []);

  const updateLiveGraphic = useCallback((graphic: TacticalGraphic) => {
    setLiveObjects(current => ({ ...current, tacticalGraphics: current.tacticalGraphics.map(item => item.id === graphic.id ? graphic : item) }));
  }, []);

  const moveLiveUnit = useCallback((id: string, location: { lng: number; lat: number }) => {
    if (liveObjects.objectives.some(objective => objective.id === id)) {
      setLiveObjects(current => ({ ...current, objectives: current.objectives.map(objective => objective.id === id ? { ...objective, position: createGeoPosition(location.lng, location.lat) } : objective) }));
      setRelocatingUnitId(undefined);
      return;
    }
    setLiveUnits(current => {
      const unit = current.find(item => item.id === id) ?? deployment?.units.find(item => item.id === id);
      if (!unit) return current;
      return [...current.filter(item => item.id !== id), { ...unit, position: createGeoPosition(location.lng, location.lat) }];
    });
    setRelocatingUnitId(undefined);
  }, [deployment, liveObjects.objectives]);
  const deleteLiveUnit = useCallback((id: string) => {
    setLiveUnits(current => current.filter(unit => unit.id !== id));
    setLiveObjects(current => ({ objectives: current.objectives.filter(objective => objective.id !== id), tacticalGraphics: current.tacticalGraphics.filter(graphic => graphic.id !== id) }));
    if (deployment?.units.some(unit => unit.id === id)) {
      setHiddenBaseUnitIds(current => current.includes(id) ? current : [...current, id]);
    }
    setSelectedLiveUnitId(undefined);
    setRelocatingUnitId(undefined);
    setLiveEditorMode({ type: 'select' });
  }, [deployment]);
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
  const visibleRosterUnits = useMemo(
    () => rosterUnits.filter(unit => !isUnitEliminated(simulationResult, unit.id, runtime.simulationTime)),
    [rosterUnits, runtime.simulationTime, simulationResult],
  );

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
        onWorldClockCountryChange={(worldClockCountryCode) => updateRuntime({ worldClockCountryCode })}
        viewMode={viewMode}
        reportMode={isAnalysisView && Boolean(compatibilityReport)}
      />

      {isAnalysisView && compatibilityReport ? (
        <SimulationCompatibilityReport report={compatibilityReport} />
      ) : isAnalysisView ? (
        <div className="flex min-h-0 flex-1">
          <UnitListPanel
            units={visibleRosterUnits}
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
          {mapMode !== '3d' && <UnitListPanel
            units={visibleRosterUnits}
            selectedUnitId={runtime.selectedUnitId}
            tacticalLayers={runtime.tacticalLayers}
            onSelectUnit={selectUnit}
            onLayerChange={setTacticalLayers}
          />}
          {runtime.activeTab === 'order' ? (
            <CommanderInbox reports={commanderReports} simulationTime={runtime.simulationTime} onSelectUnit={selectUnit} />
          ) : (
            mapMode === '3d' ? <Google3DTacticalMap
              runtime={runtime}
              playbackRef={runtimeRef}
              units={rosterUnits}
              result={simulationResult}
              deployment={deployment}
              onSelectUnit={selectUnit}
              atomicActionVisuals={atomicActionVisuals}
              liveEdit={liveEditMode ? {
                units: liveUnits,
                objectives: liveObjects.objectives,
                tacticalGraphics: liveObjects.tacticalGraphics,
                hiddenBaseUnitIds,
                mode: liveEditorMode,
                paletteOpen: livePaletteOpen,
                selectedUnitId: selectedLiveUnitId,
                relocatingUnitId,
                onModeChange: mode => {
                  if (mode.type === 'place' || mode.type === 'draw' || mode.type === 'draw-task') setSelectedLiveUnitId(undefined);
                  setRelocatingUnitId(undefined);
                  setLiveEditorMode(mode);
                },
                onTogglePalette: () => setLivePaletteOpen(open => !open),
                onPlaceUnit: placeLiveUnit,
                onPlaceObjective: placeLiveObjective,
                onAddGraphic: addLiveGraphic,
                onUpdateGraphic: updateLiveGraphic,
                onSelectUnit: id => { setSelectedLiveUnitId(id); setRelocatingUnitId(undefined); },
                onChangeDeployment: changeLiveDeployment,
                onSetRelocatingUnit: setRelocatingUnitId,
                onMoveUnit: moveLiveUnit,
                onDeleteUnit: deleteLiveUnit,
              } : undefined}
            /> : <TacticalMap
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
