import type { DeploymentAffiliation } from '../../../types';

export type ScannerVisual = {
  fillColor: string;
  fillOpacity: number;
  altitudeOffsetMeters: number;
  drawsOccludedSegments: boolean;
  zIndex: number;
};

// Scanner overlays intentionally use a separate palette from tactical areas.
// Their values are shared here so 3D presentation stays consistent as more
// sensor visualizations are added.
export const SCANNER_VISUALS: Record<DeploymentAffiliation, ScannerVisual> = {
  friendly: {
    fillColor: '#58EAD5',
    fillOpacity: 0.35,
    altitudeOffsetMeters: 300,
    drawsOccludedSegments: true,
    zIndex: 60,
  },
  enemy: {
    fillColor: '#FFB45C',
    fillOpacity: 0.35,
    altitudeOffsetMeters: 300,
    drawsOccludedSegments: true,
    zIndex: 60,
  },
};

export function scannerVisualForAffiliation(affiliation?: DeploymentAffiliation): ScannerVisual {
  return SCANNER_VISUALS[affiliation === 'enemy' ? 'enemy' : 'friendly'];
}

export function scannerFillColor(color: string, opacity: number) {
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}
