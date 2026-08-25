import { useNavigate } from 'react-router-dom';
import type { Operation } from '../../types';

type RecentOperationsTableProps = {
  operations: Operation[];
};

export function RecentOperationsTable({ operations }: RecentOperationsTableProps) {
  const navigate = useNavigate();

  return (
    <section className="glass-panel flex flex-col rounded-lg">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container/50 px-6 py-4">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-outline">Recent Operations</span>
        <button className="font-data-mono text-[11px] text-primary hover:underline">VIEW ALL OPERATIONS</button>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-variant/10 font-label-caps text-label-caps text-outline">
            <th className="px-6 py-3 font-normal">Name</th>
            <th className="px-6 py-3 font-normal">Last Modified</th>
            <th className="px-6 py-3 text-right font-normal">Current Stage</th>
          </tr>
        </thead>
        <tbody className="font-data-mono text-[13px]">
          {operations.map((operation, index) => (
            <tr
              key={operation.id}
              className={`${index !== operations.length - 1 ? 'border-b border-outline-variant/30' : ''} cursor-pointer transition-colors hover:bg-surface-variant/10`}
              onClick={() => navigate(`/mett/${operation.mettDocumentId}`)}
            >
              <td className="px-6 py-4 text-primary">{operation.name}</td>
              <td className="px-6 py-4 text-on-surface-variant">{operation.lastModified}</td>
              <td className="px-6 py-4 text-right">
                <span
                  className={
                    operation.currentStage === 'METT-TC Editing'
                      ? 'text-secondary'
                      : operation.currentStage === 'Simulation Complete'
                        ? 'text-outline'
                        : 'text-primary'
                  }
                >
                  {operation.currentStage}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
