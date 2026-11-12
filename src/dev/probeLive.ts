/**
 * Sonde de fidélité **sur site réel** (branche de sonde, jamais dans `main`).
 *
 * Deux commandes ajoutées à la sonde :
 *  - `scan`  : énumère les tickets réellement présents sur le site (le JQL en
 *    `asApp()` ne renvoie rien : la recherche Jira filtre sur les droits d'un
 *    utilisateur, et un webtrigger n'en a pas — d'où l'énumération par clé) ;
 *  - `full`  : pour un ticket, renvoie la collecte brute **et** le brief **et**
 *    le score de préparation, afin de mesurer la fidélité hors ligne
 *    (traçabilité de chaque élément du brief vers la donnée collectée).
 *
 * `full` accepte `as=<accountId>` pour rejouer la collecte **au nom d'un
 * utilisateur** (`asUser(accountId)`) au lieu de l'app : c'est le seul moyen
 * headless d'exercer le chemin BC-09 (droits de l'utilisateur appelant).
 */
import { asApp, asUser, assumeTrustedRoute } from '@forge/api';

import { buildBrief } from '../brief';
import { computeReadiness } from '../readiness';
import type { Budget } from '../types';
import { createConfluenceClient } from '../collect/confluenceClient';
import { createJiraClient } from '../collect/jiraClient';
import { createTeamworkGraphClient } from '../collect/teamworkGraphClient';
import {
  collectDecisions,
  collectIssue,
  collectNeighborChanges,
  collectProjectSettings,
} from '../collect/issueCollector';
import { loadAttempts, loadLessons } from '../storage';
import { intParam, json, param, timed } from './probeTypes';
import type { JsonResponse, ProbeRequest, ProbeResponse } from './probeTypes';

/** Accès produit : `asApp()` par défaut, `asUser(accountId)` si demandé. */
function productFetch(as?: string) {
  const api = (as ? asUser(as) : asApp()) as unknown as {
    requestJira: (path: unknown, init?: unknown) => Promise<JsonResponse>;
    requestConfluence: (path: unknown, init?: unknown) => Promise<JsonResponse>;
    requestTeamworkGraph?: (query: string, variables?: unknown) => Promise<JsonResponse>;
  };
  return {
    jira: (path: string, init?: unknown) => api.requestJira(assumeTrustedRoute(path), init),
    confluence: (path: string, init?: unknown) => api.requestConfluence(assumeTrustedRoute(path), init),
    graph: api.requestTeamworkGraph
      ? (query: string, variables?: Record<string, unknown>) =>
          (api.requestTeamworkGraph as NonNullable<typeof api.requestTeamworkGraph>)(query, variables)
      : undefined,
  };
}

function issueKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
    throw new Error(`clé de ticket invalide : « ${raw} »`);
  }
  return key;
}

/** Existe / n'existe pas : `GET /rest/api/2/issue/<cle>` en `asApp()`. */
async function probeIssue(
  fetchJira: (path: string, init?: unknown) => Promise<JsonResponse>,
  key: string
): Promise<Record<string, unknown> | null> {
  const response = await fetchJira(`/rest/api/2/issue/${key}?fields=summary,status,issuetype,created`);
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

/**
 * `cmd=scan&prefix=PAY&from=1&to=25` — énumère les tickets existants.
 * Séquentiel et borné : `to - from + 1` ≤ 60 par appel.
 */
export async function cmdScan(req: ProbeRequest): Promise<ProbeResponse> {
  const prefix = param(req, 'prefix', 'PAY').trim().toUpperCase();
  const from = Math.max(1, Number.parseInt(param(req, 'from', '1'), 10) || 1);
  const to = Math.min(from + 59, Number.parseInt(param(req, 'to', String(from + 19)), 10) || from);
  const as = param(req, 'as', '').trim() || undefined;
  const fetch = productFetch(as);
  const found: Array<Record<string, unknown>> = [];
  const [result, ms] = await timed(async () => {
    for (let n = from; n <= to; n += 1) {
      const key = `${prefix}-${n}`;
      const issue = await probeIssue(fetch.jira, key);
      if (!issue) continue;
      const fields = (issue.fields ?? {}) as Record<string, unknown>;
      const status = (fields.status ?? {}) as Record<string, unknown>;
      const type = (fields.issuetype ?? {}) as Record<string, unknown>;
      found.push({
        key,
        summary: String(fields.summary ?? ''),
        status: String(status.name ?? ''),
        type: String(type.name ?? ''),
        created: String(fields.created ?? ''),
      });
    }
    return found;
  });
  return json({ cmd: 'scan', prefix, from, to, as: as ?? 'app', ms, count: result.length, issues: result });
}

/** Construit les dépendances de collecte/brief pour un acteur donné. */
function depsFor(as?: string) {
  const fetch = productFetch(as);
  const jira = createJiraClient(fetch.jira);
  const confluence = createConfluenceClient(fetch.confluence);
  const graph = fetch.graph
    ? createTeamworkGraphClient(fetch.graph)
    : createTeamworkGraphClient(async () => {
        throw new Error('graphe indisponible pour cet acteur');
      });
  return {
    collectIssue: (key: string) => collectIssue(key, { jira }),
    collectProjectSettings: (projectKey: string) => collectProjectSettings(projectKey, { jira }),
    readSettings: (projectKey: string) => collectProjectSettings(projectKey, { jira }),
    collectDecisions: (issue: Parameters<typeof collectDecisions>[0], settings: Parameters<typeof collectDecisions>[1]) =>
      collectDecisions(issue, settings, { confluence }),
    collectNeighborChanges: (issue: Parameters<typeof collectNeighborChanges>[0]) =>
      collectNeighborChanges(issue, { graph, jira }),
    loadAttempts: (key: string) => loadAttempts(key),
    loadLessons: (key: string) => loadLessons(key),
  };
}

/**
 * `cmd=full&issue=PAY-6&budgets=s,m,l[&as=<accountId>]` — collecte brute +
 * briefs + préparation, pour mesurer la fidélité hors ligne.
 */
export async function cmdFull(req: ProbeRequest): Promise<ProbeResponse> {
  const key = issueKey(param(req, 'issue', ''));
  const as = param(req, 'as', '').trim() || undefined;
  const budgets = (param(req, 'budgets', 'm')
    .split(',')
    .map((b) => b.trim().toLowerCase())
    .filter((b) => b === 's' || b === 'm' || b === 'l') || []) as Budget[];
  const deps = depsFor(as);

  const [issue, msIssue] = await timed(() => deps.collectIssue(key));
  const [settings, msSettings] = await timed(() => deps.collectProjectSettings(issue.projectKey));
  // Tolérant comme le brief lui-même : une source en panne (Confluence refusé,
  // dev-status 403, graphe absent) devient une entrée vide + une erreur tracée,
  // jamais un 500 — sinon la mesure s'arrête au premier ticket sans voisins.
  const collected: string[] = [];
  const [decisions, msDecisions] = await timed(() =>
    deps.collectDecisions(issue, settings).catch((error: unknown) => {
      collected.push(`décisions : ${message(error)}`);
      return [];
    })
  );
  const [neighbors, msNeighbors] = await timed(() =>
    deps.collectNeighborChanges(issue).catch((error: unknown) => {
      collected.push(`voisins : ${message(error)}`);
      return [];
    })
  );
  const attempts = await deps.loadAttempts(key);

  const briefs: Record<string, unknown> = {};
  const timings: Record<string, number> = {};
  for (const budget of budgets) {
    const [brief, ms] = await timed(() => buildBrief(key, budget, deps));
    timings[budget] = ms;
    briefs[budget] = {
      tokenTarget: brief.tokenTarget,
      markdown: brief.markdown,
      objective: brief.objective,
      acceptanceCriteria: brief.acceptanceCriteria,
      applicableDecisions: brief.applicableDecisions,
      failedAttempts: brief.failedAttempts,
      neighborChanges: brief.neighborChanges,
      constraints: brief.constraints,
      lessons: brief.lessons,
      whoToAsk: brief.whoToAsk,
      gaps: brief.gaps,
      sources: brief.sources,
      truncatedSections: brief.truncatedSections ?? [],
    };
  }

  const [readiness, msReadiness] = await timed(() =>
    Promise.resolve(
      computeReadiness(issue, settings, { decisions, comments: issue.comments, attempts })
    )
  );

  return json({
    cmd: 'full',
    issueKey: key,
    actor: as ?? 'app',
    ms: { issue: msIssue, settings: msSettings, decisions: msDecisions, neighbors: msNeighbors, readiness: msReadiness, briefs: timings },
    issue: {
      summary: issue.summary,
      description: issue.description,
      status: issue.status,
      issueType: issue.issueType,
      components: issue.components,
      labels: issue.labels,
      reporter: issue.reporter,
      assignee: issue.assignee,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      epicKey: issue.epicKey ?? null,
      acceptanceCriteria: issue.acceptanceCriteria,
      links: issue.links,
      comments: issue.comments,
      history: issue.history,
      customFields: issue.customFields,
    },
    settings,
    decisions,
    neighbors,
    attempts,
    collectedErrors: collected,
    readiness,
    briefs,
  });
}

/** Message court d'une erreur, sans la pile (la sonde renvoie déjà la sienne). */
function message(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160);
}
