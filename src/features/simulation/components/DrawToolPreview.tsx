import type { TacticalGraphicType } from '../../../types';

export function DrawToolPreview({ type, label }: { type: Exclude<TacticalGraphicType, 'mil-task'>; label: string }) {
  return <svg viewBox="0 0 200 125" className="w-full rounded bg-slate-100" role="img" aria-label={`${label} 미리보기`}>
    <g fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {type === 'route' && <path d="M25 95 65 75 105 80 170 30" />}
      {type === 'axis' && <><path d="M25 95 85 65 160 35" /><path d="m133 33 27 2-16 23" /></>}
      {type === 'phase-line' && <path d="M25 90 70 65 125 65 175 35" />}
      {type === 'boundary' && <path d="M25 90 70 65 125 65 175 35" strokeDasharray="10 7" />}
      {type === 'area' && <path d="m35 90-10-50 80-20 65 30-30 50Z" fill="#80d8ff" fillOpacity="0.3" />}
      {type === 'freehand' && <path d="M25 85C35 10 75 110 100 60S150 25 175 45" />}
    </g>
    {type === 'phase-line' && <text x="98" y="52" textAnchor="middle" fontSize="12" fill="#0f172a">PL</text>}
  </svg>;
}
