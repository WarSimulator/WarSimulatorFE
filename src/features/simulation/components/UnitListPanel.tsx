import { useMemo, useState } from 'react';
import { Icon } from '../../../components/layout/Icon';
import type { SimulationRuntimeState, SimulationUnit, TacticalLayers } from '../../../types';

type UnitListPanelProps = {
  units: SimulationUnit[];
  selectedUnitId: string;
  tacticalLayers: TacticalLayers;
  onSelectUnit: (unitId: string) => void;
  onLayerChange: (layers: TacticalLayers) => void;
  actionsByUnitId?: Record<string, string>;
};

type UnitFilter = 'all' | 'friendly' | 'enemy';

const UNIT_FILTERS: { id: UnitFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'friendly', label: '아군' },
  { id: 'enemy', label: '적군' },
];

export function UnitListPanel({ units, selectedUnitId, tacticalLayers, onSelectUnit, onLayerChange, actionsByUnitId }: UnitListPanelProps) {
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('all');
  const visibleUnits = useMemo(() => units.filter((unit) => (
    unitFilter === 'all'
      || (unitFilter === 'friendly' && unit.allegiance === 'Friendly')
      || (unitFilter === 'enemy' && unit.allegiance === 'Enemy')
  )), [unitFilter, units]);
  const setLayer = (key: keyof SimulationRuntimeState['tacticalLayers'], value: boolean) => {
    onLayerChange({ ...tacticalLayers, [key]: value });
  };

  return (
    <aside className={`flex h-full flex-col border-r border-outline-variant bg-surface-container/95 ${actionsByUnitId ? 'w-[360px]' : 'w-[300px]'}`}>
      <div className="border-b border-outline-variant bg-surface-container-highest p-4">
        <p className="font-label-caps text-label-caps text-on-surface-variant">ACTIVE SCENARIO</p>
        <h2 className="mt-1 font-headline-md text-[17px] text-primary">OP. ALPHA DEFENSE</h2>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <h3 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">전투 편성</h3>
          <div className="grid grid-cols-3 gap-2">
            {UNIT_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={unitFilter === filter.id}
                onClick={() => setUnitFilter(filter.id)}
                className={`rounded border px-2 py-2 font-data-mono text-[11px] ${
                  unitFilter === filter.id ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">Unit List</h3>
          <div className="space-y-2">
            {visibleUnits.map((unit) => (
              <button
                key={unit.id}
                className={`flex w-full items-center gap-3 rounded border p-3 text-left transition-colors ${
                  selectedUnitId === unit.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-outline-variant bg-surface hover:border-primary text-on-surface'
                }`}
                onClick={() => onSelectUnit(unit.id)}
              >
                <Icon
                  name={unit.icon}
                  className={`text-[18px] ${unit.allegiance === 'Enemy' ? 'text-error' : unit.allegiance === 'Objective' ? 'text-secondary' : 'text-primary'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-data-mono text-[12px]">{unit.name}</p>
                    {actionsByUnitId && <span className={`shrink-0 rounded border px-2 py-0.5 font-data-mono text-[10px] ${actionsByUnitId[unit.id] === '대기' ? 'border-outline-variant text-on-surface-variant' : 'border-secondary/60 bg-secondary/10 text-secondary'}`}>{actionsByUnitId[unit.id] ?? '대기'}</span>}
                  </div>
                  <p className="truncate font-data-mono text-[10px] text-on-surface-variant">{unit.type}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">전술 레이어</h3>
          <div className="space-y-2">
            {[
              ['routes', '이동 경로'],
              ['controlLines', '통제선 / 목표'],
              ['labels', '부대 표찰'],
            ].map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between rounded border border-outline-variant bg-surface p-3">
                <span className="font-data-mono text-[12px] text-on-surface">{label}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-secondary"
                  checked={tacticalLayers[key as keyof TacticalLayers]}
                  onChange={(event) => setLayer(key as keyof TacticalLayers, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
