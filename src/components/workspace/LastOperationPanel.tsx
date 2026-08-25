import { useNavigate } from 'react-router-dom';
import type { Operation } from '../../types';

type LastOperationPanelProps = {
  operation: Operation;
};

export function LastOperationPanel({ operation }: LastOperationPanelProps) {
  const navigate = useNavigate();

  return (
    <section className="glass-panel overflow-hidden rounded-lg border-secondary/30">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-soft-pulse rounded-full bg-secondary" />
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">Last Operation</span>
        </div>
        <span className="font-data-mono text-[11px] text-outline">LAST MODIFIED: {operation.lastModified.toUpperCase()}</span>
      </div>
      <div className="flex flex-col items-center justify-between gap-6 p-8 md:flex-row">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">CURRENT OPERATION: {operation.name.toUpperCase()}</h3>
          <p className="mt-1 font-data-mono text-data-mono text-outline">STAGE: {operation.currentStage.toUpperCase()}</p>
        </div>
        <button
          className="rounded bg-primary px-8 py-3 font-label-caps text-label-caps text-on-primary transition-colors hover:bg-primary-fixed"
          onClick={() => navigate(`/mett/${operation.mettDocumentId}`)}
        >
          CONTINUE WORK
        </button>
      </div>
    </section>
  );
}
