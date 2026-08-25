import type { Operation } from '../types';

export const operations: Operation[] = [
  {
    id: 'op-alpha',
    name: 'Operation Alpha',
    currentStage: 'Ready for Simulation',
    lastModified: 'Today 16:42',
    mettDocumentId: 'op-alpha-primary',
  },
  {
    id: 'defense-bravo',
    name: 'Defense Bravo',
    currentStage: 'METT-TC Editing',
    lastModified: 'Today 12:18',
    mettDocumentId: 'border-recon-v2',
  },
  {
    id: 'river-crossing',
    name: 'River Crossing',
    currentStage: 'Simulation Complete',
    lastModified: 'Yesterday',
    mettDocumentId: 'sector-7-defense',
  },
];
