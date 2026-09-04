import type { DeploymentEchelon } from '../../../types';

// SIDC echelon modifiers shared by the palette and existing-unit editor.
export const echelonOptions: { value: DeploymentEchelon; mark: string; label: string; numeric: string; legacy: string }[] = [
  { value: 'fireteam', mark: 'Ø', label: 'Fireteam (공격대)', numeric: '11', legacy: 'A' },
  { value: 'squad', mark: '•', label: 'Squad / Crew (분대 / 조)', numeric: '12', legacy: 'B' },
  { value: 'section', mark: '••', label: 'Section / Patrol (반)', numeric: '13', legacy: 'C' },
  { value: 'platoon', mark: '•••', label: 'Platoon (소대)', numeric: '14', legacy: 'D' },
  { value: 'company', mark: 'I', label: 'Company (중대)', numeric: '15', legacy: 'E' },
  { value: 'battalion', mark: 'II', label: 'Battalion (대대)', numeric: '16', legacy: 'F' },
  { value: 'regiment', mark: 'III', label: 'Regiment (연대)', numeric: '17', legacy: 'G' },
  { value: 'brigade', mark: 'X', label: 'Brigade (여단)', numeric: '18', legacy: 'H' },
  { value: 'division', mark: 'XX', label: 'Division (사단)', numeric: '21', legacy: 'I' },
  { value: 'corps', mark: 'XXX', label: 'Corps (군단)', numeric: '22', legacy: 'J' },
  { value: 'army', mark: 'XXXX', label: 'Field Army (야전군)', numeric: '23', legacy: 'K' },
  { value: 'army_group', mark: 'XXXXX', label: 'Army Group (군집단 / 집단군)', numeric: '24', legacy: 'L' },
  { value: 'theater', mark: 'XXXXXX', label: 'Region / Theater (전역 / 전구)', numeric: '25', legacy: 'M' },
];

export function getEchelonCodes(echelon: DeploymentEchelon) {
  return echelonOptions.find(option => option.value === echelon) ?? echelonOptions[4];
}
