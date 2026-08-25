import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { simulationUnits } from '../../../mocks/units';
import { clampSimulationTime, createInitialRuntimeState, SIMULATION_DURATION } from '../lib/runtime';
import { ExitSimulationDialog } from '../components/ExitSimulationDialog';
import { PlaybackControls } from '../components/PlaybackControls';
import { SimulatorHeader } from '../components/SimulatorHeader';
import { TacticalMap } from '../components/TacticalMap';
import { UnitDetailPanel } from '../components/UnitDetailPanel';
import { UnitListPanel } from '../components/UnitListPanel';

export function SimulatorPage() {
  const { simulationId } = useParams();
  const navigate = useNavigate();
  const [runtime, setRuntime] = useState(() => createInitialRuntimeState());
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const selectedUnit = useMemo(
    () => simulationUnits.find((unit) => unit.id === runtime.selectedUnitId) ?? simulationUnits[0],
    [runtime.selectedUnitId],
  );

  const requestExit = () => {
    setRuntime((current) => ({ ...current, isPlaying: false }));
    setExitDialogOpen(true);
  };

  useEffect(() => {
    if (!runtime.isPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      setRuntime((current) => {
        const nextTime = clampSimulationTime(current.simulationTime + current.playbackSpeed);

        return {
          ...current,
          simulationTime: nextTime,
          isPlaying: nextTime < SIMULATION_DURATION,
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [runtime.isPlaying]);

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
          selectedUnitId={runtime.selectedUnitId}
          tacticalLayers={runtime.tacticalLayers}
          onSelectUnit={(selectedUnitId) => setRuntime((current) => ({ ...current, selectedUnitId }))}
          onLayerChange={(tacticalLayers) => setRuntime((current) => ({ ...current, tacticalLayers }))}
        />
        <TacticalMap
          runtime={runtime}
          onSelectUnit={(selectedUnitId) => setRuntime((current) => ({ ...current, selectedUnitId }))}
        />
        <UnitDetailPanel unit={selectedUnit} />
      </div>

      <PlaybackControls
        simulationTime={runtime.simulationTime}
        isPlaying={runtime.isPlaying}
        playbackSpeed={runtime.playbackSpeed}
        onTimeChange={(simulationTime) => setRuntime((current) => ({ ...current, simulationTime }))}
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
