export type OperationStage = 'METT-TC Editing' | 'Ready for Simulation' | 'Simulation Complete';

export type Operation = {
  id: string;
  name: string;
  currentStage: OperationStage;
  lastModified: string;
  mettDocumentId: string;
};

export type MettStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

export type MettSections = {
  mission: string;
  enemy: string;
  terrainWeather: string;
  troopsSupport: string;
  timeAvailable: string;
  civilConsiderations: string;
};

export type MettDocument = {
  id: string;
  name: string;
  status: MettStatus;
  author: string;
  lastModified: string;
  progressLabel: string;
  progress: number;
  sections: MettSections;
};

export type SimulationOptionKey = 'fogOfWar' | 'recordTelemetry' | 'dynamicWeather' | 'manualIntervention';

export type SimulationSetupState = {
  selectedScenarioId: string;
  fidelityMode: 'Rapid' | 'Balanced' | 'High Fidelity';
  timeScale: '1x' | '5x' | '10x';
  randomSeed: string;
  options: Record<SimulationOptionKey, boolean>;
};

export type ScenarioSummary = {
  id: string;
  name: string;
  documentId: string;
  missionType: string;
  commanderIntent: string;
  enemyForces: string;
  roeConstraints: string;
};

export type SimulationUnit = {
  id: string;
  name: string;
  allegiance: 'Friendly' | 'Enemy' | 'Objective' | 'HQ';
  type: string;
  status: string;
  combatPower: number;
  currentOrder: string;
  personnel: string;
  ammunition: string;
  mobility: string;
  position: { x: number; y: number };
  icon: string;
  log: string[];
  timeline: string[];
};

export type TacticalLayers = {
  routes: boolean;
  controlLines: boolean;
  labels: boolean;
};

export type SimulationRuntimeState = {
  simulationTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  selectedUnitId: string;
  activeTab: 'map' | 'order' | 'analysis';
  tacticalLayers: TacticalLayers;
};

export type SimulationStatus = 'planning' | 'running' | 'completed' | 'failed';

export type SimulationRun = {
  id: string;
  displayId: string;
  mettTcId: string;
  mettTcName: string;
  mettTcFileName: string;
  deploymentId: string;
  deploymentName: string;
  createdAt: string;
  status: SimulationStatus;
  coaCount: number | null;
};

export type DeploymentAffiliation = 'friendly' | 'enemy';

export type DeploymentUnitType = 'infantry' | 'mechanized_infantry' | 'armor' | 'recon' | 'artillery';
export type ExpandedDeploymentUnitType =
  | DeploymentUnitType
  | 'mortar'
  | 'air_defense'
  | 'engineer'
  | 'signal'
  | 'headquarters'
  | 'medical'
  | 'supply'
  | 'maintenance'
  | 'transportation';

export type DeploymentEchelon = 'platoon' | 'company' | 'battalion';

export type DeploymentPosition = {
  x?: number;
  y?: number;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
};

export type DeploymentUnit = {
  id: string;
  designation: string;
  affiliation: DeploymentAffiliation;
  unitType: ExpandedDeploymentUnitType;
  echelon: DeploymentEchelon;
  sidc: string;
  symbolScale?: number;
  position: DeploymentPosition;
};

export type DeploymentObjective = {
  id: string;
  name: string;
  position: DeploymentPosition;
};

export type DeploymentSetup = {
  id: string;
  name: string;
  mettTcDocumentId: string;
  units: DeploymentUnit[];
  objectives: DeploymentObjective[];
  tacticalGraphics: TacticalGraphic[];
  mapView?: {
    center: [number, number];
    zoom: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type DeploymentPaletteItem =
  | {
      kind: 'unit';
      label: string;
      affiliation: DeploymentAffiliation;
      unitType: ExpandedDeploymentUnitType;
      echelon: DeploymentEchelon;
      sidc: string;
    }
  | {
      kind: 'objective';
      label: string;
    };

export type TacticalGraphicType = 'route' | 'axis' | 'phase-line' | 'boundary' | 'area' | 'freehand';

export type LineStringGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type PolygonGeometry = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

export type TacticalGraphic = {
  id: string;
  type: TacticalGraphicType;
  name?: string;
  geometry: LineStringGeometry | PolygonGeometry;
};

export type DeploymentEditorMode =
  | { type: 'select' }
  | { type: 'place'; item: DeploymentPaletteItem }
  | { type: 'draw'; graphicType: TacticalGraphicType }
  | { type: 'append-geometry'; graphicId: string };

export type MilitarySymbolCategory = 'combat-arms' | 'fires' | 'combat-support' | 'command-control' | 'sustainment';

export type MilitarySymbolDefinition = {
  id: ExpandedDeploymentUnitType;
  label: string;
  category: MilitarySymbolCategory;
  baseEchelon: DeploymentEchelon;
};
