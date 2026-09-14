import type { TacticalGraphic } from '../../../types';

const PHASE_COLORS: Record<string, string> = {
  ORANGE: '#ff922b', AMBER: '#ffe066', GREEN: '#69f0ae', BLUE: '#64b5ff', RED: '#ff667a',
};

export function graphicColor(graphic: TacticalGraphic): string {
  const name = `${graphic.name ?? ''} ${graphic.id}`.toUpperCase().replace(/[-_]/g, ' ');
  const phase = name.match(/\bPL\s+(ORANGE|AMBER|GREEN|BLUE|RED)\b/);
  if (phase) return PHASE_COLORS[phase[1]];
  if (/\bRED\b/.test(name)) return '#f48fb1';
  if (graphic.type === 'axis' || graphic.type === 'route') return '#e0aaff';
  if (graphic.type === 'phase-line' || graphic.type === 'boundary') return '#f5f5f5';
  return '#66e0dc';
}
