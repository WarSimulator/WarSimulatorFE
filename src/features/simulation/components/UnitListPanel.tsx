import { Icon } from '../../../components/layout/Icon';
import { simulationUnits } from '../../../mocks/units';
import type { SimulationRuntimeState, TacticalLayers } from '../../../types';

type UnitListPanelProps = {
  selectedUnitId: string;
  tacticalLayers: TacticalLayers;
  onSelectUnit: (unitId: string) => void;
  onLayerChange: (layers: TacticalLayers) => void;
};

export function UnitListPanel({ selectedUnitId, tacticalLayers, onSelectUnit, onLayerChange }: UnitListPanelProps) {
  const setLayer = (key: keyof SimulationRuntimeState['tacticalLayers'], value: boolean) => {
    onLayerChange({ ...tacticalLayers, [key]: value });
  };

  return (
    <aside className="flex h-full w-[300px] flex-col border-r border-outline-variant bg-surface-container/95">
      <div className="border-b border-outline-variant bg-surface-container-highest p-4">
        <p className="font-label-caps text-label-caps text-on-surface-variant">ACTIVE SCENARIO</p>
        <h2 className="mt-1 font-headline-md text-[17px] text-primary">OP. ALPHA DEFENSE</h2>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <h3 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">전투 편성</h3>
          <div className="grid grid-cols-3 gap-2">
            {['전체', '아군', '적군'].map((filter, index) => (
              <button
                key={filter}
                className={`rounded border px-2 py-2 font-data-mono text-[11px] ${
                  index === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">Unit List</h3>
          <div className="space-y-2">
            {simulationUnits.map((unit) => (
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
                <div>
                  <p className="font-data-mono text-[12px]">{unit.name}</p>
                  <p className="font-data-mono text-[10px] text-on-surface-variant">{unit.type}</p>
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
