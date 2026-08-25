import type {
  DeploymentAffiliation,
  DeploymentEchelon,
  DeploymentPaletteItem,
  ExpandedDeploymentUnitType,
  MilitarySymbolDefinition,
} from '../../../types';

const functionIds: Record<ExpandedDeploymentUnitType, string> = {
  infantry: 'UCI---',
  mechanized_infantry: 'UCIZ--',
  armor: 'UCA---',
  recon: 'UCR---',
  artillery: 'UCF---',
  mortar: 'UCFM--',
  air_defense: 'UCD---',
  engineer: 'UCE---',
  signal: 'UUS---',
  headquarters: 'UH----',
  medical: 'USM---',
  supply: 'USS---',
  maintenance: 'USX---',
  transportation: 'UST---',
};

const echelonModifiers: Record<DeploymentEchelon, string> = {
  platoon: 'D',
  company: 'E',
  battalion: 'F',
};

export function getUnitSidc({
  affiliation,
  unitType,
  echelon,
}: {
  affiliation: DeploymentAffiliation;
  unitType: ExpandedDeploymentUnitType;
  echelon: DeploymentEchelon;
}) {
  const affiliationCode = affiliation === 'friendly' ? 'F' : 'H';
  return `S${affiliationCode}GP${functionIds[unitType]}-${echelonModifiers[echelon]}---`;
}

export const createSidc = (affiliation: DeploymentAffiliation, unitType: ExpandedDeploymentUnitType, echelon: DeploymentEchelon = 'company') =>
  getUnitSidc({ affiliation, unitType, echelon });

export const symbolCatalog: MilitarySymbolDefinition[] = [
  { id: 'infantry', label: 'Infantry', category: 'combat-arms', baseEchelon: 'company' },
  { id: 'mechanized_infantry', label: 'Mechanized Infantry', category: 'combat-arms', baseEchelon: 'company' },
  { id: 'armor', label: 'Armor', category: 'combat-arms', baseEchelon: 'company' },
  { id: 'recon', label: 'Reconnaissance', category: 'combat-arms', baseEchelon: 'platoon' },
  { id: 'artillery', label: 'Field Artillery', category: 'fires', baseEchelon: 'battalion' },
  { id: 'mortar', label: 'Mortar', category: 'fires', baseEchelon: 'company' },
  { id: 'air_defense', label: 'Air Defense', category: 'fires', baseEchelon: 'company' },
  { id: 'engineer', label: 'Engineer', category: 'combat-support', baseEchelon: 'company' },
  { id: 'signal', label: 'Signal', category: 'combat-support', baseEchelon: 'company' },
  { id: 'headquarters', label: 'Headquarters', category: 'command-control', baseEchelon: 'battalion' },
  { id: 'medical', label: 'Medical', category: 'sustainment', baseEchelon: 'company' },
  { id: 'supply', label: 'Supply', category: 'sustainment', baseEchelon: 'company' },
  { id: 'maintenance', label: 'Maintenance', category: 'sustainment', baseEchelon: 'company' },
  { id: 'transportation', label: 'Transportation', category: 'sustainment', baseEchelon: 'company' },
];

export function createPaletteItem({
  definition,
  affiliation,
  echelon,
}: {
  definition: MilitarySymbolDefinition;
  affiliation: DeploymentAffiliation;
  echelon: DeploymentEchelon;
}): DeploymentPaletteItem {
  return {
    kind: 'unit',
    label: definition.label,
    affiliation,
    unitType: definition.id,
    echelon,
    sidc: getUnitSidc({ affiliation, unitType: definition.id, echelon }),
  };
}
