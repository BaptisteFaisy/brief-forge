/** Fixtures partagées par les tests de stockage (aucune valeur sensible). */

import { BriefData, ReadinessScore } from '../../src/types';
import { AttemptRecord, ClaimRecord, LessonRecord, ProjectSettings } from '../../src/storage/types';

export const BUILT_AT = '2026-11-11T09:00:00.000Z';

export function makeBrief(issueKey = 'PAY-142', budget: BriefData['budget'] = 'm'): BriefData {
  return {
    issueKey,
    budget,
    tokenTarget: 3000,
    objective: 'Rendre le remboursement idempotent.',
    acceptanceCriteria: [
      { text: 'Un double envoi ne débite qu’une fois.', source: 'Jira PAY-142', date: '2026-11-01' },
    ],
    applicableDecisions: [],
    failedAttempts: [],
    neighborChanges: [],
    constraints: [{ text: 'Pas de migration destructive.', source: 'Confluence ADR-12', date: '2026-09-14' }],
    lessons: [],
    whoToAsk: [],
    gaps: [],
    sources: [{ label: 'Jira PAY-142', url: 'https://jira/browse/PAY-142', date: '2026-11-01' }],
    markdown: '# Brief PAY-142\n\nObjectif : …',
  };
}

export function makeReadiness(issueKey = 'PAY-142', score = 72): ReadinessScore {
  return {
    issueKey,
    score,
    ready: score >= 70,
    status: score >= 70 ? 'prêt' : 'à préciser',
    gaps: [{ criterion: 'périmètre borné', pointsLost: 15, reason: 'aucun composant' }],
    advice: 'Préciser le composant.',
  };
}

export function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: 'attempt-1',
    issueKey: 'PAY-142',
    agentName: 'rovo-agent',
    userAccountId: 'acc-1',
    startedAt: '2026-11-10T10:00:00.000Z',
    status: 'partiel',
    reportMd: '## Statut : partiel',
    criteriaCovered: '1',
    testsPassed: 'non',
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<LessonRecord> = {}): LessonRecord {
  return {
    id: 'lesson-1',
    projectKey: 'PAY',
    component: 'billing',
    text: 'Toujours vérifier la clé d’idempotence avant rejeu.',
    sourceAttemptId: 'attempt-1',
    createdAt: '2026-11-09T08:00:00.000Z',
    ...overrides,
  };
}

export function makeClaim(expiresAt: string, overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    issueKey: 'PAY-142',
    agentName: 'rovo-agent',
    userAccountId: 'acc-1',
    expiresAt,
    ...overrides,
  };
}

export const SETTINGS: ProjectSettings = {
  projectId: '10001',
  projectKey: 'PAY',
  acceptanceCriteriaField: 'customfield_10042',
  triggerStatus: 'Prêt à développer',
  triggerLabel: 'agent-ready',
  constraintsText: 'Pas de migration destructive.',
  decisionLabels: ['adr', 'decision'],
  componentZone: 'billing',
};
