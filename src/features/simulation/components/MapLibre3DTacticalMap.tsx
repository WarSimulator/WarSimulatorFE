import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import type { DeploymentSetup, SimulationResult, SimulationRuntimeState, SimulationUnit } from '../../../types';
import { createLocalOperationMapStyle, OPERATION_MAP_BOUNDS, operationValidationError } from '../lib/localOperationMap';
import { getLngLat } from '../lib/position';
import type { LiveEdit } from './Google3DTacticalMap';
import { DeploymentMap } from './DeploymentMap';
import { SymbolPalette } from './SymbolPalette';
import { TacticalMap } from './TacticalMap';
import { UnitPropertiesPanel } from './UnitPropertiesPanel';

type Props = {
  runtime: SimulationRuntimeState;
  playbackRef?: { current: SimulationRuntimeState };
  units: SimulationUnit[];
  result: SimulationResult;
  deployment?: DeploymentSetup;
  onSelectUnit: (unitId: string) => void;
  liveEdit?: LiveEdit;
  localOperationRegion?: boolean;
};

function same(first: unknown, second: unknown) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function MapLibre3DTacticalMap({ runtime, playbackRef, units, result, deployment, onSelectUnit, liveEdit, localOperationRegion = false }: Props) {
  const operationMap = useMemo(() => localOperationRegion ? { style: createLocalOperationMapStyle(), bounds: OPERATION_MAP_BOUNDS } : undefined, [localOperationRegion]);
  const [editorError, setEditorError] = useState('');
  const [editorVersion, setEditorVersion] = useState(0);
  const validateEdit = useCallback((next: DeploymentSetup) => {
    const error = localOperationRegion ? operationValidationError(next) : "";
    setEditorError(error);
    if (error) {
      // Restore Draw's transient geometry and drag positions from accepted state.
      setEditorVersion(version => version + 1);
      liveEdit?.onModeChange({ type: 'select' });
    }
    return !error;
  }, [liveEdit, localOperationRegion]);
  const changeProperties = useCallback((next: DeploymentSetup) => {
    if (validateEdit(next)) liveEdit?.onChangeDeployment(next);
  }, [liveEdit, validateEdit]);
  const displayDeployment = useMemo<DeploymentSetup | undefined>(() => deployment ? {
    ...deployment,
    units: [
      ...deployment.units.filter(unit => !liveEdit?.hiddenBaseUnitIds.includes(unit.id) && !liveEdit?.units.some(revised => revised.id === unit.id)),
      ...(liveEdit?.units ?? []),
    ],
    objectives: [...deployment.objectives, ...(liveEdit?.objectives ?? [])],
    tacticalGraphics: [...deployment.tacticalGraphics, ...(liveEdit?.tacticalGraphics ?? [])],
  } : undefined, [deployment, liveEdit?.hiddenBaseUnitIds, liveEdit?.objectives, liveEdit?.tacticalGraphics, liveEdit?.units]);

  const changeEditorDeployment = useCallback((next: DeploymentSetup) => {
    if (!displayDeployment || !liveEdit) return;
    if (next.units === displayDeployment.units && next.objectives === displayDeployment.objectives && next.tacticalGraphics === displayDeployment.tacticalGraphics) return;
    if (!validateEdit(next)) return;
    const previousIds = new Set([
      ...displayDeployment.units.map(item => item.id),
      ...displayDeployment.objectives.map(item => item.id),
      ...displayDeployment.tacticalGraphics.map(item => item.id),
    ]);
    const nextIds = new Set([
      ...next.units.map(item => item.id),
      ...next.objectives.map(item => item.id),
      ...next.tacticalGraphics.map(item => item.id),
    ]);

    for (const id of previousIds) if (!nextIds.has(id)) liveEdit.onDeleteUnit(id);

    for (const unit of next.units) {
      const previous = displayDeployment.units.find(item => item.id === unit.id);
      if (!previous && liveEdit.mode.type === 'place' && liveEdit.mode.item.kind === 'unit') {
        const [lng, lat] = getLngLat(unit.position);
        liveEdit.onPlaceUnit(liveEdit.mode.item, { lng, lat });
      } else if (previous && !same(previous.position, unit.position)) {
        const [lng, lat] = getLngLat(unit.position);
        liveEdit.onMoveUnit(unit.id, { lng, lat });
      }
    }

    for (const objective of next.objectives) {
      const previous = displayDeployment.objectives.find(item => item.id === objective.id);
      const [lng, lat] = getLngLat(objective.position);
      if (!previous) liveEdit.onPlaceObjective({ lng, lat });
      else if (!same(previous.position, objective.position)) liveEdit.onMoveUnit(objective.id, { lng, lat });
    }

    for (const graphic of next.tacticalGraphics) {
      const previous = displayDeployment.tacticalGraphics.find(item => item.id === graphic.id);
      if (!previous) liveEdit.onAddGraphic(graphic);
      else if (!same(previous, graphic)) liveEdit.onUpdateGraphic(graphic);
    }
  }, [displayDeployment, liveEdit, validateEdit]);

  if (liveEdit?.editingEnabled && displayDeployment) {
    return <section className="relative min-w-0 flex-1 overflow-hidden" style={{ '--environment-controls-right': liveEdit.selectedUnitId ? '332px' : '56px', '--map-controls-left': liveEdit.paletteOpen ? 'calc(var(--palette-width) + 32px)' : '72px', '--palette-width': 'min(380px, calc(100vw - 32px))' } as CSSProperties}>
      <DeploymentMap
        key={editorVersion}
        operationMap={operationMap}
        deployment={displayDeployment}
        selectedEntityId={liveEdit.selectedUnitId}
        mode={liveEdit.mode}
        onChange={changeEditorDeployment}
        onSelectEntity={liveEdit.onSelectUnit}
        onModeChange={liveEdit.onModeChange}
        terrain3D
      />
      {editorError && <div role="alert" className="absolute bottom-4 left-4 right-4 z-40 rounded border border-error bg-surface/95 p-3 text-xs text-error">{editorError}</div>}
      <SymbolPalette mode={liveEdit.mode} onModeChange={liveEdit.onModeChange} isOpen={liveEdit.paletteOpen} onToggle={liveEdit.onTogglePalette} />
      {liveEdit.selectedUnitId && <UnitPropertiesPanel
        deployment={displayDeployment}
        selectedEntityId={liveEdit.selectedUnitId}
        onChange={changeProperties}
        onModeChange={liveEdit.onModeChange}
        onClearSelection={() => liveEdit.onSelectUnit(undefined)}
      />}
      <div className="pointer-events-none absolute left-4 top-[72px] z-30 rounded border border-secondary/50 bg-surface/85 px-3 py-2 font-data-mono text-[11px] text-secondary backdrop-blur">MAPLIBRE GL 3D · LIVE EDIT</div>
    </section>;
  }

  return <TacticalMap
    operationMap={operationMap}
    runtime={runtime}
    playbackRef={playbackRef}
    units={units}
    result={result}
    deployment={deployment}
    onSelectUnit={onSelectUnit}
    terrain3D
    revisedUnits={liveEdit?.units}
    revisedObjectives={liveEdit?.objectives}
    revisedTacticalGraphics={liveEdit?.tacticalGraphics}
    hiddenBaseUnitIds={liveEdit?.hiddenBaseUnitIds}
  />;
}
