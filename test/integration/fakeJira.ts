/**
 * Harnais d'intégration de brief-forge (lot C1).
 *
 * `buildWorld(fixture)` fabrique un **faux Jira / Confluence / Teamwork Graph**
 * à partir d'une graine (`FixtureSpec`) et rend :
 *
 *  - les trois ports de lecture branchés sur des transports factices qui imitent
 *    le comportement réel (pagination des commentaires, visibilité restreinte,
 *    champs personnalisés, liens entrants/sortants, historique, pannes
 *    simulables, droits de l'utilisateur, réglages projet) ;
 *  - un `BriefDeps` prêt à passer à `buildBrief(key, budget, deps)` ;
 *  - l'état simulé (tentatives, leçons, réservation) et deux commandes de jeu :
 *    `simulateTicketUpdate()` (brief périmé, via le vrai trigger du socle) et
 *    `loadActiveClaim()` (conflit de réservation, expiration comprise).
 *
 * Aucun appel réseau : les **clients réels** du socle (`createJiraClient`,
 * `createConfluenceClient`, `createTeamworkGraphClient`) sont pilotés par les
 * transports de `fixtures/world.ts`, et la collecte réelle (`collectIssue`,
 * `collectDecisions`, `collectNeighborChanges`, `collectProjectSettings`) est
 * câblée sur ces clients. Le harnais mesure donc le socle, pas une doublure.
 *
 * Les types exportés ici suivent `test/integration/CONTRACT-INTEGRATION.md` § 2
 * (définis dans `fixtures/types.ts`, réexportés) : le lot C2 les consomme.
 */

import type { BriefDeps } from '../../src/brief/builder';
import { createConfluenceClient } from '../../src/collect/confluenceClient';
import { createJiraClient } from '../../src/collect/jiraClient';
import {
  collectDecisions,
  collectIssue,
  collectNeighborChanges,
  collectProjectSettings,
} from '../../src/collect/issueCollector';
import { createTeamworkGraphClient } from '../../src/collect/teamworkGraphClient';
import type {
  ConfluenceClient,
  JiraClient,
  ProjectSettings,
  TeamworkGraphClient,
} from '../../src/collect/types';
import { createQueue } from '../../src/events/queue';
import { createIssueUpdatedHandler } from '../../src/events/triggers';
import type { TriggerOutcome } from '../../src/events/triggers';
import { isExpired } from '../../src/storage/helpers';
import type { AttemptRecord, ClaimRecord, LessonRecord } from '../../src/storage/types';
import type {
  AttemptSeed,
  FakeWorld,
  FakeWorldState,
  FixtureSpec,
  JiraPermission,
} from './fixtures/types';
import {
  ATTEMPT_STATUS,
  canPermission,
  confluenceTransport,
  graphTransport,
  jiraTransport,
  memoryStore,
  resolvePermissions,
  silentLogger,
} from './fixtures/world';

export * from './fixtures/types';
export { FIXTURES } from './fixtures';
export { allComments, confluencePages, devStatusPayload, searchPages } from './fixtures/world';

/* ------------------------------------------------------------------ */
/* Graines -> enregistrements de stockage                              */
/* ------------------------------------------------------------------ */

function toAttemptRecords(fixture: FixtureSpec): AttemptRecord[] {
  return (fixture.attempts ?? []).map((seed: AttemptSeed, index: number) => ({
    id: seed.id ?? `att-${fixture.key}-${index + 1}`,
    issueKey: fixture.key,
    agentName: seed.agent,
    userAccountId: `acc-${seed.agent}`,
    startedAt: seed.at,
    status: seed.status ?? ATTEMPT_STATUS[seed.kind],
    reportMd: `${seed.summary}\n\nRaison : ${seed.reason}`,
    criteriaCovered: seed.criteriaCovered ?? '',
    testsPassed: seed.testsPassed ?? '',
  }));
}

function toLessonRecords(fixture: FixtureSpec): LessonRecord[] {
  return (fixture.lessons ?? []).map((seed, index) => ({
    id: seed.id ?? `lesson-${fixture.key}-${index + 1}`,
    projectKey: fixture.projectKey,
    component: seed.component,
    text: seed.text,
    sourceAttemptId: seed.sourceAttemptId ?? '',
    createdAt: seed.createdAt,
  }));
}

function toClaimRecord(fixture: FixtureSpec): ClaimRecord | null {
  const seed = fixture.claim;
  if (!seed) return null;
  return {
    issueKey: fixture.key,
    agentName: seed.agentName,
    userAccountId: seed.userAccountId,
    expiresAt: seed.expiresAt,
  };
}

/* ------------------------------------------------------------------ */
/* Réglages projet                                                     */
/* ------------------------------------------------------------------ */

/** Réglages lus dans Jira, complétés par les réglages déclarés par la graine. */
async function settingsOf(
  fixture: FixtureSpec,
  projectKey: string,
  jira: JiraClient
): Promise<ProjectSettings> {
  const collected = await collectProjectSettings(projectKey, { jira });
  const declared = fixture.settings ?? {};
  const settings: ProjectSettings = {
    ...collected,
    projectId: collected.projectId,
    projectKey,
    triggerStatus: declared.triggerStatus ?? collected.triggerStatus,
    decisionLabels: fixture.decisionLabels ?? declared.decisionLabels ?? collected.decisionLabels,
  };
  if (declared.triggerLabel !== undefined) settings.triggerLabel = declared.triggerLabel;
  if (declared.componentZone !== undefined) settings.componentZone = declared.componentZone;
  if (declared.acceptanceCriteriaField !== undefined) {
    settings.acceptanceCriteriaField = declared.acceptanceCriteriaField;
  }
  if (fixture.constraints !== undefined) settings.constraintsText = fixture.constraints;
  return settings;
}

/* ------------------------------------------------------------------ */
/* Dépendances de brief et simulateur d'événement                      */
/* ------------------------------------------------------------------ */

interface Ports {
  jira: JiraClient;
  confluence: ConfluenceClient;
  graph: TeamworkGraphClient;
}

type ReadSettings = (projectKey: string) => Promise<ProjectSettings>;

/** Dépendances du brief : collecte réelle sur les ports factices + stockage semé. */
function createBriefDeps(
  fixture: FixtureSpec,
  ports: Ports,
  records: { attempts: AttemptRecord[]; lessons: LessonRecord[] },
  readSettings: ReadSettings
): BriefDeps {
  return {
    collectIssue: (issueKey) => collectIssue(issueKey, { jira: ports.jira }),
    collectDecisions: (issue, settings) =>
      collectDecisions(issue, settings, { confluence: ports.confluence }),
    collectNeighborChanges: (issue) =>
      collectNeighborChanges(issue, { graph: ports.graph, jira: ports.jira }),
    collectProjectSettings: readSettings,
    readSettings,
    loadAttempts: async (issueKey) => (issueKey === fixture.key ? records.attempts : []),
    loadLessons: async (issueKey) => (issueKey === fixture.key ? records.lessons : []),
  };
}

/**
 * Simule une modification du ticket en cours de travail : l'horodatage avance,
 * puis le **vrai trigger** `issue-updated` du socle marque le brief périmé et le
 * remet dans la file de reconstruction (recette S7).
 */
function createUpdateSimulator(
  fixture: FixtureSpec,
  state: FakeWorldState,
  readSettings: ReadSettings
): (at?: string) => Promise<TriggerOutcome[]> {
  return async (at?: string) => {
    const previous = new Date(state.updatedAt).getTime();
    state.updatedAt = at ?? new Date(previous + 3_600_000).toISOString();
    const handler = createIssueUpdatedHandler({
      markBriefStale: async () => {
        state.briefStale = true;
      },
      loadIssueState: async () => ({
        issueKey: fixture.key,
        projectKey: fixture.projectKey,
        status: fixture.status,
        labels: fixture.labels,
      }),
      loadSettings: async () => {
        const settings = await readSettings(fixture.projectKey);
        return { triggerStatus: settings.triggerStatus, triggerLabel: settings.triggerLabel };
      },
      queue: createQueue(memoryStore(), silentLogger()),
      logger: silentLogger(),
    });
    const outcomes = await handler({ issue: { key: fixture.key } });
    state.queued = outcomes
      .filter((outcome) => outcome.queueResult === 'added')
      .map((outcome) => outcome.issueKey);
    return outcomes;
  };
}

/* ------------------------------------------------------------------ */
/* Construction du monde                                               */
/* ------------------------------------------------------------------ */

function initialState(fixture: FixtureSpec): FakeWorldState {
  return {
    updatedAt: fixture.updatedAt,
    briefStale: false,
    issueReads: 0,
    commentPages: 0,
    changelogPages: 0,
    devStatusReads: 0,
    graphReads: 0,
    confluenceReads: 0,
    queued: [],
  };
}

/** Réservation active sur le ticket ; `null` si absente ou expirée. */
function createClaimReader(
  claim: ClaimRecord | null
): (issueKey: string, now?: Date) => Promise<ClaimRecord | null> {
  return async (issueKey: string, now: Date = new Date()) => {
    if (!claim || claim.issueKey !== issueKey) return null;
    return isExpired(claim.expiresAt, now) ? null : claim;
  };
}

/** Fabrique le monde fake d'une fixture : ports + dépendances de brief. */
export function buildWorld(fixture: FixtureSpec): FakeWorld {
  const state = initialState(fixture);
  const ports: Ports = {
    jira: createJiraClient(jiraTransport(fixture, state)),
    confluence: createConfluenceClient(confluenceTransport(fixture, state)),
    graph: createTeamworkGraphClient(graphTransport(fixture, state)),
  };
  const records = {
    attempts: toAttemptRecords(fixture),
    lessons: toLessonRecords(fixture),
  };
  const readSettings: ReadSettings = (projectKey) => settingsOf(fixture, projectKey, ports.jira);
  const claim = toClaimRecord(fixture);

  return {
    ...ports,
    briefDeps: createBriefDeps(fixture, ports, records, readSettings),
    fixture,
    state,
    attempts: records.attempts,
    lessons: records.lessons,
    claim,
    simulateTicketUpdate: createUpdateSimulator(fixture, state, readSettings),
    loadActiveClaim: createClaimReader(claim),
    permissions: resolvePermissions(fixture.permissions),
    can: (permission: JiraPermission) => canPermission(fixture.permissions, permission),
  };
}
