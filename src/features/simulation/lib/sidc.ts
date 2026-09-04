import catalogData from '../data/symbolCatalog.json';
import type {
  DeploymentAffiliation,
  DeploymentEchelon,
  DeploymentPaletteItem,
  ExpandedDeploymentUnitType,
  MilitarySymbolDefinition,
} from '../../../types';

const functionIds: Record<Exclude<ExpandedDeploymentUnitType, `catalog:${string}`>, string> = {
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
  sidc,
}: {
  affiliation: DeploymentAffiliation;
  unitType: ExpandedDeploymentUnitType;
  echelon: DeploymentEchelon;
  sidc?: string;
}) {
  if (unitType.startsWith('catalog:')) {
    const definition = catalogById.get(unitType);
    const base = sidc ?? definition?.sidc;
    if (!base) return getUnitSidc({ affiliation, unitType: 'infantry', echelon });
    if (/^\d/.test(base)) {
      const size = definition?.supportsEchelon ? { platoon: '14', company: '15', battalion: '16' }[echelon] : base.slice(8, 10);
      return base.slice(0, 3) + (affiliation === 'friendly' ? '3' : '6') + base.slice(4, 8) + size + base.slice(10);
    }
    const size = definition?.supportsEchelon ? echelonModifiers[echelon] : base[11];
    return base[0] + (affiliation === 'friendly' ? 'F' : 'H') + base.slice(2, 11) + size + base.slice(12);
  }
  const affiliationCode = affiliation === 'friendly' ? 'F' : 'H';
  return `S${affiliationCode}GP${functionIds[unitType as keyof typeof functionIds]}-${echelonModifiers[echelon]}---`;
}

export const createSidc = (affiliation: DeploymentAffiliation, unitType: ExpandedDeploymentUnitType, echelon: DeploymentEchelon = 'company') =>
  getUnitSidc({ affiliation, unitType, echelon });

// Metadata retained only for previously saved deployments. Not offered in the palette.
const legacySymbols: MilitarySymbolDefinition[] = [
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

export const catalogStandards = catalogData.standards;
export const symbolCatalog: MilitarySymbolDefinition[] = catalogData.symbols.map((entry) => ({
  ...entry, id: entry.id as ExpandedDeploymentUnitType, standard: entry.standard as '2525' | 'APP6', baseEchelon: 'company',
}));
const catalogById = new Map(symbolCatalog.map((entry) => [entry.id, entry]));
export function getSymbolDefinition(unitType: ExpandedDeploymentUnitType) {
  return catalogById.get(unitType) ?? legacySymbols.find((entry) => entry.id === unitType);
}

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
    symbolStandard: definition.standard,
  };
}
