import { LastOperationPanel } from '../components/workspace/LastOperationPanel';
import { RecentOperationsTable } from '../components/workspace/RecentOperationsTable';
import { operations } from '../mocks/operations';

export function WorkspacePage() {
  const [lastOperation, ...recentOperations] = operations;

  return (
    <div className="mx-auto flex h-full max-w-[1440px] flex-col gap-6 p-container-padding">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="font-display-lg text-display-lg tracking-tight text-primary">WORKSPACE DASHBOARD</h2>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        <LastOperationPanel operation={lastOperation} />
        <RecentOperationsTable operations={[lastOperation, ...recentOperations]} />
      </div>
    </div>
  );
}
