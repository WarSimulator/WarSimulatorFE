import { Icon } from '../../../components/layout/Icon';
import { simulationUnits } from '../../../mocks/units';
import type { SimulationRuntimeState } from '../../../types';

type TacticalMapProps = {
  runtime: SimulationRuntimeState;
  onSelectUnit: (unitId: string) => void;
};

const mapTiles = [
  ['13', '1405', '3265'],
  ['13', '1406', '3265'],
  ['13', '1407', '3265'],
  ['13', '1405', '3266'],
  ['13', '1406', '3266'],
  ['13', '1407', '3266'],
  ['13', '1405', '3267'],
  ['13', '1406', '3267'],
  ['13', '1407', '3267'],
];

export function TacticalMap({ runtime, onSelectUnit }: TacticalMapProps) {
  if (runtime.activeTab !== 'map') {
    const label = runtime.activeTab === 'order' ? '명령 계획' : '분석 결과';
    return (
      <section className="flex flex-1 items-center justify-center bg-surface-container-lowest">
        <div className="glass-panel w-[520px] rounded border border-outline-variant p-8 text-center">
          <p className="font-label-caps text-label-caps text-secondary">{label}</p>
          <h2 className="mt-2 font-headline-md text-headline-md text-on-surface">Prototype placeholder</h2>
          <p className="mt-2 font-body-base text-body-base text-on-surface-variant">전술 상황도 탭만 현재 구현되어 있습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex-1 overflow-hidden bg-[#161616]">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-55 grayscale">
        {mapTiles.map(([z, x, y]) => (
          <img
            key={`${z}-${x}-${y}`}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            src={`https://tile.openstreetmap.org/${z}/${x}/${y}.png`}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-surface/45 mix-blend-multiply" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(18,18,18,0.72)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:80px_80px]" />

      {runtime.tacticalLayers.controlLines && (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 700">
          <polygon points="260,180 720,210 790,540 230,560" fill="rgba(245,245,245,0.06)" stroke="#888888" strokeDasharray="8 5" strokeWidth="2" />
          <line x1="180" x2="820" y1="410" y2="360" stroke="#ffb95f" strokeDasharray="10 6" strokeWidth="2" />
          <text x="680" y="345" fill="#ffb95f" fontFamily="JetBrains Mono" fontSize="12">PL IRON</text>
        </svg>
      )}

      {runtime.tacticalLayers.routes && (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 700">
          <path d="M 380 322 L 460 245 L 570 378" fill="none" stroke="#f5f5f5" strokeDasharray="7 5" strokeWidth="2" opacity="0.7" />
        </svg>
      )}

      <div className="absolute left-6 top-6 z-10 flex items-center gap-2">
        <div className="glass-panel flex h-10 w-10 items-center justify-center rounded border-primary/50 text-primary">
          <Icon name="layers" />
        </div>
        <div className="glass-panel rounded px-3 py-2 font-data-mono text-[11px] text-on-surface-variant">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-secondary" />
          OPEN MAP FEED
        </div>
      </div>
      <div className="absolute bottom-3 right-3 z-10 rounded border border-outline-variant bg-surface/80 px-2 py-1 font-data-mono text-[9px] text-outline">
        © OpenStreetMap contributors
      </div>

      {simulationUnits.map((unit) => {
        const selected = unit.id === runtime.selectedUnitId;
        const tone =
          unit.allegiance === 'Enemy'
            ? 'border-error bg-error/20 text-error'
            : unit.allegiance === 'Objective'
              ? 'border-secondary bg-secondary/20 text-secondary'
              : 'border-primary bg-primary/20 text-primary';

        return (
          <button
            key={unit.id}
            className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${unit.position.x}%`, top: `${unit.position.y}%` }}
            onClick={() => onSelectUnit(unit.id)}
          >
            <span className={`flex h-9 w-9 items-center justify-center border-2 backdrop-blur-sm ${tone} ${selected ? 'shadow-[0_0_14px_rgba(245,245,245,0.5)]' : ''} ${unit.allegiance === 'Enemy' ? 'rotate-45' : ''}`}>
              <Icon name={unit.icon} className={`text-[18px] ${unit.allegiance === 'Enemy' ? '-rotate-45' : ''}`} />
            </span>
            {runtime.tacticalLayers.labels && (
              <span className={`mt-1 border bg-surface/80 px-1 font-data-mono text-[10px] ${unit.allegiance === 'Enemy' ? 'border-error/30 text-error' : unit.allegiance === 'Objective' ? 'border-secondary/30 text-secondary' : 'border-primary/30 text-primary'}`}>
                {unit.name}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}
