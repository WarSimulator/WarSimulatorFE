type ExitSimulationDialogProps = {
  open: boolean;
  onCancel: () => void;
  onExit: () => void;
};

export function ExitSimulationDialog({ open, onCancel, onExit }: ExitSimulationDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="w-[420px] rounded border border-outline-variant bg-surface-container-high p-5 shadow-2xl">
        <p className="font-label-caps text-label-caps text-secondary">Exit Simulation?</p>
        <h2 className="mt-2 font-headline-md text-headline-md text-on-surface">The current simulation playback will stop.</h2>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded border border-outline-variant px-4 py-2 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded bg-secondary px-4 py-2 font-label-caps text-label-caps text-on-secondary transition-colors hover:bg-secondary-container"
            onClick={onExit}
          >
            Exit Simulator
          </button>
        </div>
      </div>
    </div>
  );
}
