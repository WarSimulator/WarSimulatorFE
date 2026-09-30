import { Icon } from '../../../components/layout/Icon';
import type { SimulationUnit } from '../../../types';

type Props = {
  unit: SimulationUnit;
  action: string;
  onClose: () => void;
};

export function SelectedUnitActionCard({ unit, action, onClose }: Props) {
  const isIdle = action === '대기';
  return (
    <aside className="pointer-events-auto absolute right-6 top-6 z-30 w-[280px] overflow-hidden rounded border border-outline-variant bg-surface-container-high/95 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3 border-b border-outline-variant px-4 py-3">
        <div className="min-w-0">
          <p className="font-label-caps text-[9px] tracking-[0.16em] text-on-surface-variant">SELECTED UNIT</p>
          <h3 className="mt-1 truncate font-headline-md text-[16px] text-on-surface">{unit.name}</h3>
        </div>
        <button
          type="button"
          aria-label="선택 유닛 정보 닫기"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${unit.allegiance === 'Enemy' ? 'border-error/70 bg-error/15 text-error' : 'border-primary/70 bg-primary/15 text-primary'}`}>
          <Icon name={unit.icon} className="text-[20px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-label-caps text-[9px] text-outline">CURRENT ACTION</p>
          <p className={`mt-1 truncate font-data-mono text-[13px] font-semibold ${isIdle ? 'text-on-surface-variant' : 'text-secondary'}`}>{action}</p>
        </div>
      </div>
    </aside>
  );
}
