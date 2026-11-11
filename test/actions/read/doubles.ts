/**
 * Doublures partagées par les tests des sept outils de lecture.
 *
 * Aucun appel réseau, aucun runtime Forge : collecte, brief, stockage et
 * contrôle d'accès sont remplacés par des `jest.fn()`. En revanche, les
 * helpers de règle métier du brief (`criteriaLines`, `failedAttempts`,
 * `sortedNeighbors`) restent **réels** : c'est justement leur comportement que
 * les tests vérifient (filtre des tentatives échouées, ordre antéchronologique,
 * règle des critères d'acceptation).
 */

import type {
  DecisionRecord,
  IssueSnapshot,
  NeighborChange,
  ProjectSettings,
} from '../../../src/collect/types';
import type { BriefData, ReadinessScore } from '../../../src/types';
import type { AttemptRecord, StoredBrief } from '../../../src/storage';

export const ISSUE_KEY = 'PAY-142';
export const PROJECT_KEY = 'PAY';
export const ACCOUNT_ID = 'acc-jdoe';

/** Contexte Forge minimal : l'identité de l'appelant ne vient que d'ici. */
export const CONTEXT = {
  accountId: ACCOUNT_ID,
  principal: { accountId: ACCOUNT_ID },
  clientName: 'client-de-test',
};

/** Brief réel (module complet) dont seule la construction est doublée. */
const actualBrief = jest.requireActual('../../../src/brief') as Record<string, unknown>;

export const briefDoubles = {
  ...actualBrief,
  buildBrief: jest.fn(),
};

export const collectDoubles = {
  collectIssue: jest.fn(),
  collectDecisions: jest.fn(),
  collectNeighborChanges: jest.fn(),
  collectProjectSettings: jest.fn(),
};

export const storageDoubles = {
  loadBrief: jest.fn(),
  saveBrief: jest.fn(),
  loadReadiness: jest.fn(),
  saveReadiness: jest.fn(),
  loadAttempts: jest.fn(),
  loadProjectSettings: jest.fn(),
  logAccess: jest.fn(),
  getSqlClient: jest.fn(),
  TABLES: {
    brief: 'brief',
    readiness: 'readiness',
    attempt: 'attempt',
    review: 'review',
    lesson: 'lesson',
    claim: 'claim',
    accessLog: 'access_log',
    projectSettings: 'project_settings',
  },
};

export const guardDoubles = {
  assertIssueAccessFromContext: jest.fn(),
  resolveCallerAccountId: jest.fn(),
  isSafeIssueKey: jest.fn(),
};

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

export function makeIssue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    issueKey: ISSUE_KEY,
    projectKey: PROJECT_KEY,
    summary: 'Remboursement idempotent',
    description: 'Un double envoi ne doit débiter le compte qu’une seule fois.',
    status: 'Prêt à développer',
    issueType: 'Story',
    components: ['paiements'],
    labels: [],
    reporter: 'jdoe',
    assignee: 'jdoe',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
    acceptanceCriteria: [
      'Un double envoi ne débite qu’une fois.',
      'Le journal d’audit garde la trace de chaque remboursement.',
    ],
    links: [],
    comments: [],
    history: [],
    customFields: {},
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    projectId: '10000',
    projectKey: PROJECT_KEY,
    triggerStatus: 'Prêt à développer',
    decisionLabels: ['decision'],
    ...overrides,
  };
}

export function makeDecision(
  title: string,
  date: string,
  author = 'archi'
): DecisionRecord {
  return { title, url: `https://confluence/x/${title.length}`, date, author, body: `${title} — corps.` };
}

export function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: 'att-1',
    issueKey: ISSUE_KEY,
    agentName: 'claude-code',
    userAccountId: ACCOUNT_ID,
    startedAt: '2026-11-01T08:00:00.000Z',
    status: 'bloqué',
    reportMd: '## Fait\nAjout d’une clé d’idempotence.\n\n## Raison : le schéma ne permet pas d’index unique.',
    criteriaCovered: '1',
    testsPassed: 'non',
    ...overrides,
  };
}

export function makeChange(overrides: Partial<NeighborChange> = {}): NeighborChange {
  return {
    kind: 'pull-request',
    title: 'refactor(paiements): extraire le service de remboursement',
    url: 'https://bitbucket.org/x/pr/12',
    date: '2026-10-20T12:00:00.000Z',
    author: 'mdupont',
    state: 'merged',
    ...overrides,
  };
}

export function makeBrief(budget: BriefData['budget'] = 'm'): BriefData {
  return {
    issueKey: ISSUE_KEY,
    budget,
    tokenTarget: 3000,
    objective: 'Rendre le remboursement idempotent.',
    acceptanceCriteria: [
      { text: 'Un double envoi ne débite qu’une fois.', source: `Jira ${ISSUE_KEY}`, date: '2026-11-05' },
    ],
    applicableDecisions: [],
    failedAttempts: [],
    neighborChanges: [],
    constraints: [],
    lessons: [],
    whoToAsk: [],
    gaps: [],
    sources: [{ label: `Jira ${ISSUE_KEY}`, url: `https://jira/browse/${ISSUE_KEY}`, date: '2026-11-05' }],
    markdown: `# Brief de travail — ${ISSUE_KEY} (budget ${budget})`,
  };
}

export function makeStoredBrief(
  brief: BriefData = makeBrief(),
  overrides: Partial<StoredBrief> = {}
): StoredBrief {
  return {
    issueKey: brief.issueKey,
    budget: brief.budget,
    contentMd: brief.markdown,
    contentJson: JSON.stringify(brief),
    sourcesJson: JSON.stringify(brief.sources),
    builtAt: '2026-11-11T09:00:00.000Z',
    stale: false,
    ...overrides,
  };
}

export function makeReadiness(score = 78): ReadinessScore {
  return {
    issueKey: ISSUE_KEY,
    score,
    ready: score >= 70,
    status: score >= 70 ? 'prêt' : 'à préciser',
    gaps: [{ criterion: 'périmètre borné', pointsLost: 15, reason: 'aucun composant identifié' }],
    advice: 'Préciser le composant.',
  };
}

/* ------------------------------------------------------------------ */
/* Mise en place                                                      */
/* ------------------------------------------------------------------ */

/** Remet toutes les doublures à zéro entre deux tests. */
export function resetDoubles(): void {
  const groups: Array<Record<string, unknown>> = [
    briefDoubles,
    collectDoubles,
    storageDoubles,
    guardDoubles,
  ];
  for (const group of groups) {
    for (const value of Object.values(group)) {
      if (jest.isMockFunction(value)) value.mockReset();
    }
  }
}

/** Comportements nominaux : accès autorisé, identité connue, collecte servie. */
export function primeDoubles(): void {
  guardDoubles.isSafeIssueKey.mockImplementation((key: string) =>
    /^[A-Z][A-Z0-9_]{0,31}-\d{1,9}$/.test(key)
  );
  guardDoubles.resolveCallerAccountId.mockReturnValue(ACCOUNT_ID);
  guardDoubles.assertIssueAccessFromContext.mockResolvedValue(undefined);

  collectDoubles.collectIssue.mockResolvedValue(makeIssue());
  collectDoubles.collectProjectSettings.mockResolvedValue(makeSettings());
  collectDoubles.collectDecisions.mockResolvedValue([]);
  collectDoubles.collectNeighborChanges.mockResolvedValue([]);

  storageDoubles.loadBrief.mockResolvedValue(null);
  storageDoubles.saveBrief.mockResolvedValue(undefined);
  storageDoubles.loadReadiness.mockResolvedValue(null);
  storageDoubles.saveReadiness.mockResolvedValue(undefined);
  storageDoubles.loadAttempts.mockResolvedValue([]);
  storageDoubles.loadProjectSettings.mockResolvedValue(null);
  storageDoubles.logAccess.mockResolvedValue(undefined);
}

/** Réponse de refus typée, pour lire `error`/`code` sans transtypage bruyant. */
export function asFailure(value: unknown): { ok: false; error: string; code: string } {
  return value as { ok: false; error: string; code: string };
}
