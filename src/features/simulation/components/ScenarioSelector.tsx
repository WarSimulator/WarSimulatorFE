import { Icon } from '../../../components/layout/Icon';
import { scenarios } from '../../../mocks/scenarios';

type ScenarioSelectorProps = {
  selectedScenarioId: string;
  onSelect: (scenarioId: string) => void;
};

export function ScenarioSelector({ selectedScenarioId, onSelect }: ScenarioSelectorProps) {
  return (
    <section className="glass-panel flex min-h-[620px] flex-col rounded border border-outline-variant">
      <div className="border-b border-outline-variant bg-surface-container/70 p-4">
        <h3 className="flex items-center gap-2 font-label-caps text-label-caps text-on-surface">
          <Icon name="assignment" className="text-[18px] text-primary" />
          SELECT METT-TC / OP ORDER
        </h3>
        <div className="mt-4 flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2">
          <Icon name="search" className="text-[18px] text-outline" />
          <input
            className="w-full bg-transparent font-data-mono text-[12px] text-on-surface outline-none placeholder:text-outline"
            placeholder="Search archive..."
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {scenarios.map((scenario) => {
          const selected = scenario.id === selectedScenarioId;

          return (
            <button
              key={scenario.id}
              className={`w-full rounded border p-4 text-left transition-colors ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant bg-surface-container-high text-on-surface hover:border-primary'
              }`}
              onClick={() => onSelect(scenario.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-headline-md text-[16px]">{scenario.name}</p>
                  <p className="mt-1 font-data-mono text-[11px] text-on-surface-variant">{scenario.documentId.toUpperCase()}</p>
                </div>
                <span className={`rounded border px-2 py-0.5 font-label-caps text-[9px] ${selected ? 'border-secondary/40 text-secondary' : 'border-outline-variant text-outline'}`}>
                  {selected ? 'SELECTED' : 'ARCHIVE'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 font-data-mono text-[11px]">
                <span className="text-outline">MISSION</span>
                <span className="text-right text-on-surface-variant">{scenario.missionType}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
