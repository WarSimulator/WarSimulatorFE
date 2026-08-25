import type { ScenarioSummary } from '../types';

export const scenarios: ScenarioSummary[] = [
  {
    id: 'scenario-alpha',
    name: 'Op. Alpha - Primary',
    documentId: 'op-alpha-primary',
    missionType: 'Deliberate Defense',
    commanderIntent: 'Deny enemy access to the northern approach and preserve combat power for follow-on counterattack.',
    enemyForces: 'Mechanized reconnaissance company with probable indirect fire observer support.',
    roeConstraints: 'Minimize collateral damage near civil infrastructure. Positive identification required before engagement.',
  },
  {
    id: 'scenario-border',
    name: 'Border Recon V2',
    documentId: 'border-recon-v2',
    missionType: 'Reconnaissance in Force',
    commanderIntent: 'Confirm enemy disposition without decisive engagement and maintain route flexibility.',
    enemyForces: 'Light infantry screen with mobile anti-armor teams.',
    roeConstraints: 'Avoid escalation beyond designated observation zones.',
  },
  {
    id: 'scenario-sector-7',
    name: 'Sector 7 Defense',
    documentId: 'sector-7-defense',
    missionType: 'Area Security',
    commanderIntent: 'Protect logistics corridor and maintain access to emergency services.',
    enemyForces: 'Dispersed irregular elements with low mobility.',
    roeConstraints: 'Civilian movement corridors remain protected at all times.',
  },
];
