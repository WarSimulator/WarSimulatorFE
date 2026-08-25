import { MilitarySymbol } from './MilitarySymbol';
import { ObjectiveSymbol } from './ObjectiveSymbol';
import type { DeploymentSetup } from '../../../types';
import { getLngLat } from '../lib/position';
import { DEFAULT_MAP_CENTER } from '../lib/mapConfig';

type DeploymentPreviewProps = {
  deployment: DeploymentSetup;
};

export function DeploymentPreview({ deployment }: DeploymentPreviewProps) {
  const center = deployment.mapView?.center ?? DEFAULT_MAP_CENTER;
  const toPreviewPoint = ([longitude, latitude]: [number, number]) => ({
    x: 50 + (longitude - center[0]) * 90,
    y: 50 - (latitude - center[1]) * 90,
  });

  return (
    <div className="relative min-h-[300px] flex-1 overflow-hidden rounded border border-outline-variant bg-[#161616]">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-35 grayscale">
        {[
          ['13', '1405', '3265'],
          ['13', '1406', '3265'],
          ['13', '1407', '3265'],
          ['13', '1405', '3266'],
          ['13', '1406', '3266'],
          ['13', '1407', '3266'],
          ['13', '1405', '3267'],
          ['13', '1406', '3267'],
          ['13', '1407', '3267'],
        ].map(([z, x, y]) => (
          <img key={`${z}-${x}-${y}`} alt="" className="h-full w-full object-cover" src={`https://tile.openstreetmap.org/${z}/${x}/${y}.png`} />
        ))}
      </div>
      <div className="absolute inset-0 bg-surface/50" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
      {deployment.units.map((unit) => (
        <div key={unit.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${toPreviewPoint(getLngLat(unit.position)).x}%`, top: `${toPreviewPoint(getLngLat(unit.position)).y}%` }}>
          <MilitarySymbol sidc={unit.sidc} size={30} />
        </div>
      ))}
      {deployment.objectives.map((objective) => (
        <div key={objective.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${toPreviewPoint(getLngLat(objective.position)).x}%`, top: `${toPreviewPoint(getLngLat(objective.position)).y}%` }}>
          <ObjectiveSymbol size={30} />
        </div>
      ))}
      <svg className="absolute inset-0 z-10 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {deployment.tacticalGraphics.map((graphic) => {
          if (graphic.geometry.type === 'LineString') {
            const points = graphic.geometry.coordinates.map((coord) => {
              const point = toPreviewPoint(coord);
              return `${point.x},${point.y}`;
            });
            return (
              <polyline
                key={graphic.id}
                points={points.join(' ')}
                fill="none"
                stroke={graphic.type === 'axis' ? '#ffb95f' : graphic.type === 'phase-line' ? '#f5f5f5' : '#888888'}
                strokeDasharray={graphic.type === 'boundary' ? '4 3' : graphic.type === 'phase-line' ? '8 4' : undefined}
                strokeWidth="1.5"
              />
            );
          }
          const points = graphic.geometry.coordinates[0].map((coord) => {
            const point = toPreviewPoint(coord);
            return `${point.x},${point.y}`;
          });
          return <polygon key={graphic.id} points={points.join(' ')} fill="rgba(255,185,95,0.12)" stroke="#ffb95f" strokeWidth="1" />;
        })}
      </svg>
      <div className="absolute bottom-2 right-2 rounded border border-outline-variant bg-surface/80 px-2 py-1 font-data-mono text-[9px] text-outline">
        DEPLOYMENT PREVIEW
      </div>
    </div>
  );
}
