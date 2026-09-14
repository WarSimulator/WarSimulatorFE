import ms from 'milsymbol';

const THREE_D_UNIT_SYMBOL_SIZE = 28;
const THREE_D_SELECTED_UNIT_SYMBOL_SIZE = 33;

export function createMilitarySymbolSvg(sidc: string, size = 42, label?: string, standard: '2525' | 'APP6' = '2525') {
  // The installed renderer supplies only an empty outline for 270701.
  // Reference-image depiction requested for the editor: four hollow mines
  // inside a narrow rectangle. Shared by palette and both map renderers.
  if (/^\d{20}$/.test(sidc) && sidc.slice(4, 6) === '25' && sidc.slice(10, 16) === '270701') {
    const geometry = '<rect x="8" y="5" width="24" height="94"/><circle cx="20" cy="21" r="5"/><circle cx="20" cy="41" r="5"/><circle cx="20" cy="61" r="5"/><circle cx="20" cy="81" r="5"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 0.4}" height="${size}" viewBox="0 0 40 104"><g fill="none" stroke="#f8fafc" stroke-width="5">${geometry}</g><g fill="none" stroke="black" stroke-width="2.5">${geometry}</g></svg>`;
  }
  return new ms.Symbol(sidc, {
    size,
    standard,
    // A light halo preserves black linework against dark terrain and UI surfaces.
    outlineColor: '#f8fafc',
    outlineWidth: 3,
    // Control-measure label overrides measure this field even with infoFields off.
    uniqueDesignation: label ?? '',
    infoFields: Boolean(label),
  }).asSVG();
}

/** Keep 3D markers compact while honoring the deployment's Symbol Size control. */
export function get3DUnitSymbolSize(symbolScale?: number, selected = false) {
  const scale = Number.isFinite(symbolScale) ? Math.max(0.1, symbolScale!) : 1;
  return (selected ? THREE_D_SELECTED_UNIT_SYMBOL_SIZE : THREE_D_UNIT_SYMBOL_SIZE) * scale;
}

export function createObjectiveSvg(size = 42) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
    <circle cx="21" cy="21" r="13" fill="rgba(255,185,95,0.12)" stroke="#ffb95f" stroke-width="2" stroke-dasharray="4 3"/>
    <path d="M21 10v22M10 21h22" stroke="#ffb95f" stroke-width="2"/>
    <circle cx="21" cy="21" r="3" fill="#ffb95f"/>
  </svg>`;
}
