import { mettDocuments } from '../mocks/mettDocuments';
import type { MettDocument } from '../types';

const STORAGE_KEY = 'atlas-defense.mett-documents';

export function loadMettDocuments(): MettDocument[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return mettDocuments;
  }

  try {
    return JSON.parse(stored) as MettDocument[];
  } catch {
    return mettDocuments;
  }
}

export function saveMettDocuments(documents: MettDocument[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
}

export function createBlankMettDocument(): MettDocument {
  const id = `mett-${Date.now()}`;

  return {
    id,
    name: 'New METT-TC Draft',
    status: 'DRAFT',
    author: 'Operator',
    lastModified: new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z',
    progressLabel: 'Draft Created',
    progress: 0,
    sections: {
      mission: '',
      enemy: '',
      terrainWeather: '',
      troopsSupport: '',
      timeAvailable: '',
      civilConsiderations: '',
    },
  };
}
