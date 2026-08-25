import { Icon } from '../../../components/layout/Icon';
import type { DeploymentEditorMode, DeploymentSetup } from '../../../types';
import { DeploymentMap } from './DeploymentMap';
import { SymbolPalette } from './SymbolPalette';
import { UnitPropertiesPanel } from './UnitPropertiesPanel';

type DeploymentEditorProps = {
  draft: DeploymentSetup;
  mettTcLabel: string;
  mode: DeploymentEditorMode;
  selectedEntityId?: string;
  onDraftChange: (deployment: DeploymentSetup) => void;
  onModeChange: (mode: DeploymentEditorMode) => void;
  onSelectEntity: (entityId?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCancel: () => void;
  onSave: () => void;
};

export function DeploymentEditor({
  draft,
  mettTcLabel,
  mode,
  selectedEntityId,
  onDraftChange,
  onModeChange,
  onSelectEntity,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCancel,
  onSave,
}: DeploymentEditorProps) {
  return (
    <section className="fixed bottom-0 left-0 right-0 top-[48px] z-30 flex flex-col bg-surface transition-all duration-300">
      <header className="flex h-[72px] items-center justify-between border-b border-outline-variant bg-surface-container-high px-6">
        <div className="flex items-center gap-6">
          <div>
            <p className="font-label-caps text-label-caps text-secondary">DEPLOYMENT EDITOR</p>
            <input
              className="mt-1 w-[280px] border border-outline-variant bg-surface px-3 py-2 font-headline-md text-[16px] text-on-surface outline-none focus:border-primary"
              value={draft.name}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="border-l border-outline-variant pl-6">
            <p className="font-label-caps text-[10px] text-outline">METT-TC</p>
            <p className="mt-1 font-data-mono text-[12px] text-on-surface-variant">{mettTcLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="rounded border border-outline-variant px-3 py-2 font-label-caps text-label-caps text-on-surface transition-colors enabled:hover:bg-surface-variant disabled:opacity-40"
            disabled={!canUndo}
            onClick={onUndo}
          >
            UNDO
          </button>
          <button
            className="rounded border border-outline-variant px-3 py-2 font-label-caps text-label-caps text-on-surface transition-colors enabled:hover:bg-surface-variant disabled:opacity-40"
            disabled={!canRedo}
            onClick={onRedo}
          >
            REDO
          </button>
          <button
            className="rounded border border-outline-variant px-4 py-2 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant"
            onClick={onCancel}
          >
            CANCEL
          </button>
          <button
            className="flex items-center gap-2 rounded bg-secondary px-5 py-2 font-label-caps text-label-caps text-on-secondary transition-colors hover:bg-secondary-container"
            onClick={onSave}
          >
            <Icon name="save" className="text-[16px]" />
            SAVE SETUP
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <DeploymentMap
          deployment={draft}
          selectedEntityId={selectedEntityId}
          mode={mode}
          onChange={onDraftChange}
          onSelectEntity={onSelectEntity}
          onModeChange={onModeChange}
        />
        <SymbolPalette mode={mode} onModeChange={onModeChange} />
        <UnitPropertiesPanel
          deployment={draft}
          selectedEntityId={selectedEntityId}
          onChange={onDraftChange}
          onModeChange={onModeChange}
          onClearSelection={() => onSelectEntity(undefined)}
        />
      </div>
    </section>
  );
}
