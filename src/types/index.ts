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
  sidc?: string;
  symbolStandard?: '2525' | 'APP6';
  symbolScale?: number;
  /** Clockwise symbol rotation in degrees. Defaults to 0. */
  symbolRotation?: number;
  geographicPosition?: SimulationResultPosition;
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

export type SimulationResultPosition = {
  longitude: number;
  latitude: number;
};

export type SimulationKeyframe = {
  time: number;
  position: SimulationResultPosition;
};

export type SimulationTrackSegment = {
  actionSequence: number;
  action: string;
  startTime: number;
  endTime: number;
  source: string;
  destination: string;
  keyframes: SimulationKeyframe[];
};

export type SimulationUnitTrack = {
  unitId: string;
  actor: string;
  startTime: number;
  endTime: number;
  segments: SimulationTrackSegment[];
};

export type SimulationResultEvent = {
  time: number;
  type: 'ACTION_STARTED' | 'ACTION_COMPLETED' | string;
  actionSequence: number;
  actor: string;
  action: string;
};

export type ObservationEffect = {
  actionSequence: number;
  action: 'Observe';
  actor: string;
  target: string;
  startTime: number;
  endTime: number;
  origin: SimulationResultPosition;
  targetPoint: SimulationResultPosition;
  direction: number;
  fovDegrees: number;
  rangeMeters: number;
  targetDistanceMeters: number;
  targetInRange: boolean;
  displayRangeMeters: number;
};

export type SimulationResult = {
  schemaVersion: '1.0';
  planIndex: number;
  deploymentId: string | null;
  startTime: number;
  endTime: number;
  unitTracks: SimulationUnitTrack[];
  observationEffects?: ObservationEffect[];
  events: SimulationResultEvent[];
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
  | 'transportation'
  | `catalog:${string}`;

export type DeploymentEchelon = 'fireteam' | 'squad' | 'section' | 'platoon' | 'company' | 'battalion' | 'regiment' | 'brigade' | 'division' | 'corps' | 'army' | 'army_group' | 'theater';

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
  symbolStandard?: '2525' | 'APP6';
  symbolLabel?: string;
  symbolScale?: number;
  /** Clockwise symbol rotation in degrees. Defaults to 0. */
  symbolRotation?: number;
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
      symbolStandard?: '2525' | 'APP6';
    }
  | {
      kind: 'objective';
      label: string;
    };

export type TacticalGraphicType = 'route' | 'axis' | 'phase-line' | 'boundary' | 'area' | 'freehand' | 'mil-task';

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
  tacticalSymbol?: { definitionId: string; sidc: string; affiliation: DeploymentAffiliation };
  name?: string;
  geometry: LineStringGeometry | PolygonGeometry;
};

export type DeploymentEditorMode =
  | { type: 'select' }
  | { type: 'place'; item: DeploymentPaletteItem }
  | { type: 'draw'; graphicType: Exclude<TacticalGraphicType, 'mil-task'> }
  | { type: 'draw-task'; definitionId: string; affiliation: DeploymentAffiliation }
  | { type: 'append-geometry'; graphicId: string };

export type MilitarySymbolCategory = string;

export type MilitarySymbolDefinition = {
  id: ExpandedDeploymentUnitType;
  label: string;
  category: MilitarySymbolCategory;
  baseEchelon: DeploymentEchelon;
  standardId?: string;
  standard?: '2525' | 'APP6';
  sidc?: string;
  supportsEchelon?: boolean;
  remarks?: string;
};
