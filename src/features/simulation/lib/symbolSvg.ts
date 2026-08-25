import ms from 'milsymbol';

export function createMilitarySymbolSvg(sidc: string, size = 42, label?: string) {
  return new ms.Symbol(sidc, {
    size,
    uniqueDesignation: label,
    infoFields: Boolean(label),
  }).asSVG();
}

export function createObjectiveSvg(size = 42) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
    <circle cx="21" cy="21" r="13" fill="rgba(255,185,95,0.12)" stroke="#ffb95f" stroke-width="2" stroke-dasharray="4 3"/>
    <path d="M21 10v22M10 21h22" stroke="#ffb95f" stroke-width="2"/>
    <circle cx="21" cy="21" r="3" fill="#ffb95f"/>
  </svg>`;
}
