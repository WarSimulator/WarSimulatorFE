import { echelonOptions } from '../lib/echelons';
import { getTacticalTask, taskLabel } from '../lib/tacticalTasks';
import type { DeploymentEditorMode, DeploymentEchelon, DeploymentObjective, DeploymentSetup, DeploymentUnit, TacticalGraphic } from '../../../types';
import { getLngLat } from '../lib/position';
import { getSymbolDefinition, getUnitSidc } from '../lib/sidc';

type UnitPropertiesPanelProps = {
  deployment: DeploymentSetup;
  selectedEntityId?: string;
  onChange: (deployment: DeploymentSetup) => void;
  onModeChange: (mode: DeploymentEditorMode) => void;
  onClearSelection: () => void;
};

export function UnitPropertiesPanel({ deployment, selectedEntityId, onChange, onModeChange, onClearSelection }: UnitPropertiesPanelProps) {
  const unit = deployment.units.find((item) => item.id === selectedEntityId);
  const objective = deployment.objectives.find((item) => item.id === selectedEntityId);
  const graphic = deployment.tacticalGraphics.find((item) => item.id === selectedEntityId);
  const unitPosition = unit ? getLngLat(unit.position) : undefined;
  const objectivePosition = objective ? getLngLat(objective.position) : undefined;

  if (!unit && !objective && !graphic) {
    return null;
  }

  const updateUnit = (nextUnit: DeploymentUnit) => {
    onChange({ ...deployment, units: deployment.units.map((item) => (item.id === nextUnit.id ? nextUnit : item)) });
  };

  const updateObjective = (nextObjective: DeploymentObjective) => {
    onChange({ ...deployment, objectives: deployment.objectives.map((item) => (item.id === nextObjective.id ? nextObjective : item)) });
  };

  const removeSelected = () => {
    onChange({
      ...deployment,
      units: deployment.units.filter((item) => item.id !== selectedEntityId),
      objectives: deployment.objectives.filter((item) => item.id !== selectedEntityId),
      tacticalGraphics: deployment.tacticalGraphics.filter((item) => item.id !== selectedEntityId),
    });
    onClearSelection();
  };

  const updateGraphic = (nextGraphic: TacticalGraphic) => {
    onChange({ ...deployment, tacticalGraphics: deployment.tacticalGraphics.map((item) => (item.id === nextGraphic.id ? nextGraphic : item)) });
  };

  return (
    <aside className="absolute right-4 top-4 z-30 w-[300px] rounded border border-outline-variant bg-surface-container/95 shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-high p-3">
        <p className="font-label-caps text-label-caps text-on-surface">{unit ? 'UNIT PROPERTIES' : objective ? 'OBJECTIVE PROPERTIES' : 'TACTICAL GRAPHIC'}</p>
        <button
          type="button"
          aria-label="속성 패널 닫기"
          title="닫기"
          onClick={onClearSelection}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-on-surface-variant hover:bg-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="space-y-4 p-4">
        {unit && (
          <>
            <label className="block">
              <span className="mb-1 block font-label-caps text-[10px] text-outline">Designation</span>
              <input
                className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none focus:border-primary"
                value={unit.designation}
                onChange={(event) => updateUnit({ ...unit, designation: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2 font-data-mono text-[11px]">
              <span className="text-outline">Affiliation</span>
              <span className="text-on-surface">{unit.affiliation.toUpperCase()}</span>
              <span className="text-outline">Unit Type</span>
              <span className="text-on-surface">{unit.symbolLabel ?? getSymbolDefinition(unit.unitType)?.label ?? unit.unitType.replace(/_/g, ' ').toUpperCase()}</span>
            </div>
            <label className="block">
              <span className="mb-1 block font-label-caps text-[10px] text-outline">Echelon</span>
              <select
                className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none focus:border-primary"
                value={unit.echelon}
                disabled={getSymbolDefinition(unit.unitType)?.supportsEchelon === false}
                onChange={(event) => {
                  const echelon = event.target.value as DeploymentEchelon;
                  updateUnit({ ...unit, echelon, sidc: getUnitSidc({ ...unit, echelon }) });
                }}
              >
                {echelonOptions.map(option => <option key={option.value} value={option.value}>{option.mark} · {option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block font-label-caps text-[10px] text-outline">Symbol Size</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.25"
                value={unit.symbolScale ?? 1}
                className="w-full accent-secondary"
                onChange={(event) => updateUnit({ ...unit, symbolScale: Number(event.target.value) })}
              />
              <div className="mt-1 flex justify-between font-data-mono text-[10px] text-outline">
                <span>50%</span>
                <span className="text-secondary">{Math.round((unit.symbolScale ?? 1) * 100)}%</span>
                <span>200%</span>
              </div>
            </label>
            <div className="rounded border border-outline-variant bg-surface p-2 font-data-mono text-[11px] text-on-surface-variant">
              Position: {unitPosition?.[0].toFixed(5)} / {unitPosition?.[1].toFixed(5)}
            </div>
          </>
        )}

        {objective && (
          <>
            <label className="block">
              <span className="mb-1 block font-label-caps text-[10px] text-outline">Objective Name</span>
              <input
                className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none focus:border-primary"
                value={objective.name}
                onChange={(event) => updateObjective({ ...objective, name: event.target.value })}
              />
            </label>
            <div className="rounded border border-outline-variant bg-surface p-2 font-data-mono text-[11px] text-on-surface-variant">
              Position: {objectivePosition?.[0].toFixed(5)} / {objectivePosition?.[1].toFixed(5)}
            </div>
          </>
        )}

        {graphic && (
          <>
            <div className="grid grid-cols-2 gap-2 font-data-mono text-[11px]">
              <span className="text-outline">Type</span>
              <span className="text-on-surface">{getTacticalTask(graphic.tacticalSymbol?.definitionId) ? taskLabel(getTacticalTask(graphic.tacticalSymbol?.definitionId)!) : graphic.type.toUpperCase()}</span>
              <span className="text-outline">Points</span>
              <span className="text-on-surface">
                {graphic.geometry.type === 'LineString' ? graphic.geometry.coordinates.length : graphic.geometry.coordinates[0].length - 1}
              </span>
            </div>
            <label className="block">
              <span className="mb-1 block font-label-caps text-[10px] text-outline">Name</span>
              <input
                className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none focus:border-primary"
                value={graphic.name ?? ''}
                onChange={(event) => updateGraphic({ ...graphic, name: event.target.value })}
              />
            </label>
            <button
              className="w-full rounded border border-outline-variant px-4 py-2 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant"
              onClick={() => onModeChange({ type: 'append-geometry', graphicId: graphic.id })}
            >
              EDIT {graphic.type.replace(/-/g, ' ').toUpperCase()}
            </button>
          </>
        )}

        <button
          className="w-full rounded border border-error/60 px-4 py-2 font-label-caps text-label-caps text-error transition-colors hover:bg-error-container/30"
          onClick={removeSelected}
        >
          DELETE SELECTED
        </button>
      </div>
    </aside>
  );
}
