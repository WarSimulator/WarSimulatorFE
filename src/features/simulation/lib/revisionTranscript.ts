const KEY_PREFIX = 'atlas-defense.simulation-revision-transcript.';

export function loadRevisionTranscript(simulationId?: string) {
  if (!simulationId) return '';
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${simulationId}`) ?? '';
  } catch {
    return '';
  }
}

export function saveRevisionTranscript(simulationId: string | undefined, transcript: string) {
  if (!simulationId) return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${simulationId}`, transcript);
  } catch {
    // Voice commands remain available in memory if browser storage is full.
  }
}
