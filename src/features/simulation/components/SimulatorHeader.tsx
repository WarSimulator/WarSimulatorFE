import { Icon } from '../../../components/layout/Icon';
import { formatSimulationClock } from '../lib/runtime';
import type { SimulationRuntimeState } from '../../../types';

type SimulatorHeaderProps = {
  runtime: SimulationRuntimeState;
  onTabChange: (tab: SimulationRuntimeState['activeTab']) => void;
  onExit: () => void;
};

const tabs: Array<{ id: SimulationRuntimeState['activeTab']; label: string }> = [
  { id: 'map', label: '전술 상황도' },
  { id: 'order', label: '명령 계획' },
  { id: 'analysis', label: '분석 결과' },
];

export function SimulatorHeader({ runtime, onTabChange, onExit }: SimulatorHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-outline-variant bg-surface-container-high px-4">
      <div className="flex h-full items-center gap-4">
        <button
          className="flex items-center gap-2 rounded border border-secondary/50 bg-secondary/10 px-3 py-1.5 font-label-caps text-label-caps text-secondary transition-colors hover:bg-secondary/20"
          onClick={onExit}
        >
          <Icon name="arrow_back" className="text-[16px]" />
          EXIT SIMULATOR
        </button>
        <div className="h-5 w-px bg-outline-variant" />
        <h1 className="font-headline-md text-[18px] font-bold text-primary">ATLAS COA SIMULATION</h1>
        <nav className="flex h-full items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`h-full border-b-2 px-4 font-label-caps text-label-caps transition-colors ${
                runtime.activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 font-data-mono text-[11px] text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
          SIMULATION READY
        </span>
        <span className="rounded border border-outline-variant bg-surface px-3 py-1 font-data-mono text-[13px] text-primary">
          {formatSimulationClock(runtime.simulationTime)}
        </span>
      </div>
    </header>
  );
}
