/**
 * Orchestration de la collecte déterministe (WP-collect).
 *
 * Ce module est le seul endroit qui câble le runtime Forge : les transports
 * (`asUser().requestJira` / `requestConfluence` / `requestTeamworkGraph`) sont
 * construits ici, paresseusement, et injectés dans les clients. En test, on
 * passe `deps` et aucun appel réseau n'est effectué.
 *
 * Règle de sécurité (§ 13) : toute donnée tierce (description, commentaire,
 * page) est nettoyée par `sanitizeTicketContent` avant de sortir de la collecte.
 */

import { MAX_COMMENTS_FOR_DECISION_SCAN } from '../config';
import { BriefError, PermissionDeniedError } from '../util/errors';
import {
  createConfluenceClient,
  isConfluenceUnavailable,
  parseDecisionPages,
} from './confluenceClient';
import {
  createJiraClient,
  fieldNameMap,
  findAcceptanceCriteriaField,
  parseComments,
  parseHistory,
  parseIssueSnapshot,
} from './jiraClient';
import {
  DEFAULT_DECISION_LABELS,
  asString,
  defaultProjectSettings,
  isoDaysAgo,
} from './settingsDefaults';
import {
  NEIGHBOR_WINDOW_DAYS,
  createTeamworkGraphClient,
  dedupeChanges,
  parseDevStatusChanges,
  parseNeighborChanges,
} from './teamworkGraphClient';
import type {
  ConfluenceClient,
  DecisionRecord,
  ForgeModule,
  ForgeUserApi,
  GraphTransport,
  IssueComment,
  IssueSnapshot,
  JiraClient,
  NeighborChange,
  ProjectSettings,
  TeamworkGraphClient,
  Transport,
} from './types';

export interface CollectDeps {
  jira?: JiraClient;
  confluence?: ConfluenceClient;
  graph?: TeamworkGraphClient;
}

/* ------------------------------------------------------------------ *
 * Câblage Forge (paresseux : jamais chargé en test)
 * ------------------------------------------------------------------ */

function forgeModule(): ForgeModule {
  // Chargement paresseux : les tests injectent `deps` et n'atteignent jamais
  // cette ligne ; hors runtime Forge, `require` échouerait à l'import.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@forge/api') as ForgeModule;
}

function forgeUser(): ForgeUserApi {
  const api = forgeModule();
  const asUser = api.asUser ?? api.default?.asUser;
  if (typeof asUser !== 'function') {
    throw new BriefError(
      'INTERNAL_ERROR',
      "@forge/api n'expose pas asUser() : collecte impossible hors runtime Forge."
    );
  }
  return asUser();
}

function forgeRoute(path: string): unknown {
  const route = forgeModule().route;
  return typeof route === 'function' ? route`${path}` : path;
}

export function jiraTransport(): Transport {
  return (path, init) => forgeUser().requestJira(forgeRoute(path), init);
}

export function confluenceTransport(): Transport {
  return (path, init) => forgeUser().requestConfluence(forgeRoute(path), init);
}

export function graphTransport(): GraphTransport {
  return (query, variables) => forgeUser().requestTeamworkGraph(query, variables);
}

/* ------------------------------------------------------------------ *
 * Filtrage des commentaires
 * ------------------------------------------------------------------ */

const DECISION_MARKER =
  /\[(décision|decision|adr)\]|(^|\s)(décision|decision|adr)\s*:|on a (choisi|décidé|retenu)|nous avons (choisi|décidé|retenu)/i;

export function isDecisionComment(body: string): boolean {
  return DECISION_MARKER.test(body);
}

export function hasQuestion(body: string): boolean {
  return body.includes('?');
}

/**
 * Sur un ticket à 300 commentaires, ne garde que les candidats utiles au brief :
 * commentaires marqués décision, réponses à une question, et les N derniers
 * (`MAX_COMMENTS_FOR_DECISION_SCAN`). Le tri est chronologique et stable.
 */
export function selectCandidateComments(
  comments: IssueComment[],
  limit: number = MAX_COMMENTS_FOR_DECISION_SCAN
): IssueComment[] {
  const ordered = [...comments].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
  const selected = new Map<string, IssueComment>();
  for (const comment of ordered.slice(-limit)) selected.set(comment.id, comment);
  ordered.forEach((comment, index) => {
    if (isDecisionComment(comment.body) || answersQuestion(ordered, index)) {
      selected.set(comment.id, comment);
    }
  });
  return [...selected.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

function answersQuestion(comments: IssueComment[], index: number): boolean {
  if (index === 0) return false;
  const previous = comments[index - 1];
  return hasQuestion(previous.body) && !hasQuestion(comments[index].body);
}

/* ------------------------------------------------------------------ *
 * Collecte d'un ticket
 * ------------------------------------------------------------------ */

export async function collectIssue(
  issueKey: string,
  deps: CollectDeps = {}
): Promise<IssueSnapshot> {
  const jira = deps.jira ?? createJiraClient(jiraTransport());
  const fieldNames = await safeFieldNames(jira);
  const raw = await jira.fetchIssue(issueKey);
  const snapshot = parseIssueSnapshot(raw, { fieldNames });
  const [rawComments, changelog] = await Promise.all([
    jira.fetchComments(issueKey),
    jira.fetchChangelog(issueKey),
  ]);
  const comments = rawComments.length > 0 ? parseComments(rawComments) : snapshot.comments;
  return {
    ...snapshot,
    comments: selectCandidateComments(comments),
    history: parseHistory(changelog),
  };
}

/** Noms de champs personnalisés : métadonnée non essentielle, best effort. */
async function safeFieldNames(jira: JiraClient): Promise<Record<string, string>> {
  try {
    return fieldNameMap(await jira.fetchFields());
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Décisions Confluence
 * ------------------------------------------------------------------ */

export async function collectDecisions(
  issue: IssueSnapshot,
  settings: ProjectSettings,
  deps: CollectDeps = {}
): Promise<DecisionRecord[]> {
  const labels =
    settings.decisionLabels.length > 0 ? settings.decisionLabels : DEFAULT_DECISION_LABELS;
  const confluence = deps.confluence ?? createConfluenceClient(confluenceTransport());
  try {
    const pages = await confluence.searchPagesByLabels(labels, issue.issueKey);
    return parseDecisionPages(pages);
  } catch (error) {
    // App non multi-produits : la lecture Confluence est optionnelle (§ 4.1).
    if (isConfluenceUnavailable(error)) return [];
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Changements voisins
 * ------------------------------------------------------------------ */

export async function collectNeighborChanges(
  issue: IssueSnapshot,
  deps: CollectDeps = {}
): Promise<NeighborChange[]> {
  const graph = deps.graph ?? createTeamworkGraphClient(graphTransport());
  try {
    const raw = await graph.fetchNeighborChanges({
      issueKey: issue.issueKey,
      componentNames: issue.components,
      linkedKeys: issue.links.map((link) => link.key),
      since: isoDaysAgo(NEIGHBOR_WINDOW_DAYS),
    });
    const fromGraph = parseNeighborChanges(raw);
    if (fromGraph.length > 0) return dedupeChanges(fromGraph);
  } catch (error) {
    if (!isSoftFailure(error)) throw error;
  }
  return neighborChangesFromDevInfo(issue, deps);
}

/** Repli : information de développement Jira (jamais Bitbucket, § 4.1). */
async function neighborChangesFromDevInfo(
  issue: IssueSnapshot,
  deps: CollectDeps
): Promise<NeighborChange[]> {
  const jira = deps.jira ?? createJiraClient(jiraTransport());
  try {
    const issueId = await jira.resolveIssueId(issue.issueKey);
    if (issueId === '') return [];
    return parseDevStatusChanges(await jira.fetchDevStatus(issueId));
  } catch (error) {
    if (!isSoftFailure(error)) throw error;
    return [];
  }
}

/** Un refus de droits utilisateur doit remonter ; le reste est un repli. */
function isSoftFailure(error: unknown): boolean {
  return !(error instanceof PermissionDeniedError);
}

/* ------------------------------------------------------------------ *
 * Réglages projet
 * ------------------------------------------------------------------ */

export async function collectProjectSettings(
  projectKey: string,
  deps: CollectDeps = {}
): Promise<ProjectSettings> {
  const jira = deps.jira ?? createJiraClient(jiraTransport());
  const defaults = defaultProjectSettings(projectKey);
  try {
    const project = await jira.fetchProject(projectKey);
    const criteriaField = findAcceptanceCriteriaField(await jira.fetchFields());
    return {
      ...defaults,
      projectId: asString(project.id) || projectKey,
      acceptanceCriteriaField: criteriaField,
    };
  } catch (error) {
    if (!isSoftFailure(error)) throw error;
    return defaults;
  }
}
