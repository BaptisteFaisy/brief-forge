/**
 * Le monde simulé du harnais d'intégration (lot C1).
 *
 * Ce module transforme une graine (`FixtureSpec`) en charges JSON telles que
 * Jira, Confluence et le Teamwork Graph les renverraient, puis en transports
 * (`Transport`, `GraphTransport`) que les **clients réels** du socle
 * (`createJiraClient`, `createConfluenceClient`, `createTeamworkGraphClient`)
 * savent consommer. Rien n'est réimplémenté côté test : la pagination, le
 * tri, la détection de visibilité restreinte et le repli sur l'information de
 * développement Jira sont ceux du code de production.
 *
 * Aucun appel réseau : tout reste dans ce fichier.
 */

import type {
  GraphTransport,
  HttpResponseLike,
  Transport,
} from '../../../src/collect/types';
import type { KeyValueStore, Logger } from '../../../src/events/queue';
import type {
  CommentSeed,
  DecisionSeed,
  FixtureSpec,
  JiraPermission,
  LinkSeed,
  NeighborSeed,
  PermissionSeed,
} from './types';

/* ------------------------------------------------------------------ */
/* Constantes et petites aides                                         */
/* ------------------------------------------------------------------ */

export const FAKE_BASE = 'https://exemple.atlassian.net';

const DEFAULT_PAGE_SIZE = 100;
const DECISION_COMMENT_PREFIX = '[décision]';
const CRITERIA_FIELD_ID = 'customfield_10010';

/** Statut d'une tentative, déduit de son kind quand la graine n'en dit rien. */
export const ATTEMPT_STATUS: Record<NonNullable<FixtureSpec['attempts']>[number]['kind'], string> = {
  'pr-refusee': 'abandonné',
  reouverture: 'abandonné',
  'compte-rendu': 'partiel',
  'ticket-clos': 'bloqué',
};

export function jsonResponse(payload: unknown, status = 200): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

export function silentLogger(): Logger {
  return { info: () => undefined, warn: () => undefined, error: () => undefined };
}

export function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: async (key) => data.get(key),
    set: async (key, value) => {
      data.set(key, value);
    },
    delete: async (key) => {
      data.delete(key);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Charges Jira                                                        */
/* ------------------------------------------------------------------ */

function commentPayload(seed: CommentSeed): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: seed.id,
    author: { displayName: seed.author },
    created: seed.createdAt,
    body: seed.body,
  };
  if (seed.visibility === 'restricted') {
    payload.visibility = { type: 'role', value: 'Administrateurs' };
    payload.jsdPublic = false;
  }
  return payload;
}

/** Les décisions marquées « commentaire » deviennent des commentaires Jira. */
function decisionComments(fixture: FixtureSpec): CommentSeed[] {
  return (fixture.decisions ?? [])
    .filter((seed) => seed.via === 'comment')
    .map((seed, index) => ({
      id: `decision-${index + 1}`,
      author: seed.author,
      createdAt: seed.date,
      body: `${DECISION_COMMENT_PREFIX} ${seed.title}\n${seed.body}`,
      visibility: 'public' as const,
    }));
}

/** Tous les commentaires du ticket, triés chronologiquement. */
export function allComments(fixture: FixtureSpec): CommentSeed[] {
  return [...(fixture.comments ?? []), ...decisionComments(fixture)].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

function linkPayload(link: LinkSeed): Record<string, unknown> {
  const target = {
    key: link.key,
    fields: {
      status: { name: link.status ?? 'À faire' },
      summary: link.title ?? `Ticket ${link.key}`,
    },
  };
  return link.direction === 'inward'
    ? { type: { name: link.type }, inwardIssue: target }
    : { type: { name: link.type }, outwardIssue: target };
}

/** Critères d'acceptation portés par le champ personnalisé dédié. */
function criteriaField(fixture: FixtureSpec): Record<string, unknown> {
  const criteria = fixture.acceptanceCriteria ?? [];
  if (criteria.length === 0) return {};
  const declared = fixture.customFields ?? [];
  const alreadyDeclared = declared.some(
    (field) => field.id === CRITERIA_FIELD_ID || /crit[eè]res?|acceptance/i.test(field.name)
  );
  if (alreadyDeclared) return {};
  const lines = criteria.map((item) => `- ${item}`).join('\n');
  return { [CRITERIA_FIELD_ID]: `Critères d'acceptation:\n${lines}` };
}

function issueFields(fixture: FixtureSpec, updatedAt: string): Record<string, unknown> {
  return {
    summary: fixture.summary,
    description: fixture.description ?? '',
    status: { name: fixture.status },
    issuetype: { name: fixture.issueType },
    components: fixture.components.map((name) => ({ name })),
    labels: fixture.labels,
    reporter: { displayName: fixture.reporter },
    assignee: fixture.assignee ? { displayName: fixture.assignee } : null,
    created: fixture.createdAt,
    updated: updatedAt,
    project: { key: fixture.projectKey, id: '10000' },
    issuelinks: (fixture.links ?? []).map(linkPayload),
    comment: { comments: [] },
    ...(fixture.epicKey ? { parent: { key: fixture.epicKey } } : {}),
    ...criteriaField(fixture),
    ...Object.fromEntries((fixture.customFields ?? []).map((f) => [f.id, f.value])),
  };
}

export function issuePayload(fixture: FixtureSpec, updatedAt: string): Record<string, unknown> {
  return { id: '10001', key: fixture.key, fields: issueFields(fixture, updatedAt) };
}

function changelogPayload(fixture: FixtureSpec): Record<string, unknown>[] {
  return (fixture.history ?? []).map((entry) => ({
    created: entry.at,
    author: { displayName: entry.author },
    items: [{ field: 'status', fromString: entry.from, toString: entry.to }],
  }));
}

/** Table des noms de champs personnalisés (sert à `collectProjectSettings`). */
function fieldsPayload(fixture: FixtureSpec): Record<string, unknown>[] {
  const declared = (fixture.customFields ?? []).map((field) => ({
    id: field.id,
    name: field.name,
  }));
  const criteria = criteriaField(fixture);
  const criteriaEntry = Object.keys(criteria).length > 0
    ? [{ id: CRITERIA_FIELD_ID, name: "Critères d'acceptation" }]
    : [];
  return [...criteriaEntry, ...declared];
}

function paginate(
  items: unknown[],
  url: URL,
  size: number,
  collection: 'comments' | 'values'
): Record<string, unknown> {
  const startAt = Number(url.searchParams.get('startAt') ?? '0');
  const requested = Number(url.searchParams.get('maxResults') ?? String(size));
  const batchSize = Math.max(1, Math.min(size, requested > 0 ? requested : size));
  return {
    startAt,
    maxResults: batchSize,
    total: items.length,
    [collection]: items.slice(startAt, startAt + batchSize),
  };
}

/* ------------------------------------------------------------------ */
/* Charges Confluence                                                  */
/* ------------------------------------------------------------------ */

function pagePayload(seed: DecisionSeed, mentions: string[]): Record<string, unknown> {
  const base = seed.url.startsWith(FAKE_BASE) ? FAKE_BASE : '';
  const webui = base === '' ? seed.url : seed.url.slice(FAKE_BASE.length);
  const refs = mentions.length > 0 ? `<p>Tickets concernés : ${mentions.join(', ')}</p>` : '';
  return {
    id: `page-${seed.url}`,
    title: seed.title,
    labels: seed.labels ?? ['decision'],
    _links: { base, webui },
    version: { when: seed.date, by: { displayName: seed.author } },
    body: { storage: { value: `<p>${seed.body}</p>${refs}` } },
  };
}

export function confluencePages(fixture: FixtureSpec): Record<string, unknown>[] {
  return (fixture.decisions ?? [])
    .filter((seed) => seed.via === 'confluence')
    .map((seed) => pagePayload(seed, seed.mentions ?? [fixture.key]));
}

function labelsFromCql(cql: string): string[] {
  const match = /label in \(([^)]*)\)/.exec(cql);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((label) => label.trim().replace(/"/g, ''))
    .filter((label) => label !== '');
}

function keyFromCql(cql: string): string {
  const match = /text ~ "([^"]*)"/.exec(cql);
  return match ? match[1] : '';
}

function pageText(page: Record<string, unknown>): string {
  const body = page.body as { storage?: { value?: string } } | undefined;
  return `${String(page.title ?? '')} ${body?.storage?.value ?? ''}`;
}

/** Pages servies par la recherche CQL : étiquette partagée et texte cité. */
export function searchPages(fixture: FixtureSpec, cql: string): Record<string, unknown>[] {
  const labels = labelsFromCql(cql);
  const key = keyFromCql(cql);
  return confluencePages(fixture)
    .filter((page) => {
      const pageLabels = (page.labels as string[]) ?? [];
      return labels.length === 0 || pageLabels.some((label) => labels.includes(label));
    })
    .filter((page) => key === '' || pageText(page).includes(key))
    .sort((left, right) => {
      const when = (page: Record<string, unknown>): string =>
        String((page.version as { when?: string })?.when ?? '');
      return when(right).localeCompare(when(left));
    });
}

/* ------------------------------------------------------------------ */
/* Charges Teamwork Graph et repli Jira                                */
/* ------------------------------------------------------------------ */

function neighborNodes(fixture: FixtureSpec): Record<string, unknown>[] {
  return (fixture.neighbors ?? []).map((seed: NeighborSeed) => ({
    __typename: seed.kind === 'pull-request' ? 'PullRequest' : 'Commit',
    title: seed.title,
    url: seed.url,
    createdAt: seed.date,
    author: { name: seed.author },
    ...(seed.state ? { state: seed.state } : {}),
  }));
}

/** Type de donnée demandé à l'information de développement Jira. */
export type DevDataType = 'pullrequest' | 'repository';

/**
 * Information de développement Jira : repli quand le graphe est muet.
 *
 * Forme réelle de l'API : `dataType=pullrequest` ne renvoie que les pull
 * requests, `dataType=repository` que les dépôts et leurs commits. Le socle lit
 * les deux réponses (`parseDevStatusChanges`) : les commits ne sont plus perdus.
 */
export function devStatusPayload(
  fixture: FixtureSpec,
  dataType: DevDataType = 'pullrequest'
): Record<string, unknown> {
  const neighbors = fixture.neighbors ?? [];
  if (dataType === 'repository') {
    const commits = neighbors
      .filter((seed) => seed.kind === 'commit')
      .map((seed) => ({
        message: seed.title,
        url: seed.url,
        authorTimestamp: seed.date,
        author: { name: seed.author },
      }));
    return { detail: [{ repositories: [{ commits }] }] };
  }
  const pullRequests = neighbors
    .filter((seed) => seed.kind === 'pull-request')
    .map((seed) => ({
      name: seed.title,
      url: seed.url,
      status: seed.state ?? 'OPEN',
      lastUpdate: seed.date,
      author: { name: seed.author },
    }));
  return { detail: [{ pullRequests }] };
}

/* ------------------------------------------------------------------ */
/* Transports factices                                                 */
/* ------------------------------------------------------------------ */

/** Panne Confluence : app non multi-produits (repli silencieux du socle). */
function confluenceOutage(): never {
  throw Object.assign(new Error('Confluence not enabled for this app (multi-product required)'), {
    name: 'RequestProductNotAllowedError',
  });
}

export function resolvePermissions(seed?: PermissionSeed): Required<PermissionSeed> {
  return {
    browse: seed?.browse ?? true,
    comment: seed?.comment ?? true,
    edit: seed?.edit ?? true,
  };
}

function myPermissionsPayload(seed?: PermissionSeed): Record<string, unknown> {
  const perms = resolvePermissions(seed);
  return {
    permissions: {
      BROWSE_PROJECTS: { havePermission: perms.browse },
      ADD_COMMENTS: { havePermission: perms.comment },
      EDIT_ISSUES: { havePermission: perms.edit },
    },
  };
}

export function canPermission(seed: PermissionSeed | undefined, perm: JiraPermission): boolean {
  const perms = resolvePermissions(seed);
  if (perm === 'BROWSE_PROJECTS') return perms.browse;
  if (perm === 'ADD_COMMENTS') return perms.comment;
  return perms.edit;
}

export function jiraTransport(
  fixture: FixtureSpec,
  state: { updatedAt: string; issueReads: number; commentPages: number; changelogPages: number; devStatusReads: number }
): Transport {
  return async (path) => {
    const url = new URL(path, FAKE_BASE);
    const here = url.pathname;
    if (here === '/rest/api/2/mypermissions' || here === '/rest/api/3/mypermissions') {
      return jsonResponse(myPermissionsPayload(fixture.permissions));
    }
    if (!resolvePermissions(fixture.permissions).browse) {
      return jsonResponse({ errorMessages: ['permission denied'] }, 403);
    }
    if (here === `/rest/api/2/issue/${fixture.key}`) {
      state.issueReads += 1;
      if (url.searchParams.get('fields') === 'id') return jsonResponse({ id: '10001' });
      return jsonResponse(issuePayload(fixture, state.updatedAt));
    }
    if (here === `/rest/api/2/issue/${fixture.key}/comment`) {
      state.commentPages += 1;
      const comments = allComments(fixture).map(commentPayload);
      return jsonResponse(paginate(comments, url, fixture.commentPageSize ?? DEFAULT_PAGE_SIZE, 'comments'));
    }
    if (here === `/rest/api/2/issue/${fixture.key}/changelog`) {
      state.changelogPages += 1;
      return jsonResponse(paginate(changelogPayload(fixture), url, DEFAULT_PAGE_SIZE, 'values'));
    }
    if (here === `/rest/api/2/project/${fixture.projectKey}`) {
      return jsonResponse({ id: '10000', key: fixture.projectKey, name: fixture.projectKey });
    }
    if (here === '/rest/api/2/field') return jsonResponse(fieldsPayload(fixture));
    if (here === '/rest/dev-status/latest/issue/detail') {
      state.devStatusReads += 1;
      const dataType = url.searchParams.get('dataType') === 'repository' ? 'repository' : 'pullrequest';
      return jsonResponse(devStatusPayload(fixture, dataType));
    }
    return jsonResponse({ errorMessages: ['not found'] }, 404);
  };
}

export function confluenceTransport(
  fixture: FixtureSpec,
  state: { confluenceReads: number }
): Transport {
  return async (path) => {
    if ((fixture.outages ?? []).includes('confluence')) confluenceOutage();
    const url = new URL(path, FAKE_BASE);
    state.confluenceReads += 1;
    if (url.pathname === '/wiki/rest/api/content/search') {
      return jsonResponse({ results: searchPages(fixture, url.searchParams.get('cql') ?? '') });
    }
    const wanted = /^\/wiki\/rest\/api\/content\/(.+)$/.exec(url.pathname);
    if (wanted) {
      const id = `page-${decodeURIComponent(wanted[1])}`;
      const found = confluencePages(fixture).find((page) => page.id === id);
      return found ? jsonResponse(found) : jsonResponse({}, 404);
    }
    return jsonResponse({}, 404);
  };
}

export function graphTransport(
  fixture: FixtureSpec,
  state: { graphReads: number }
): GraphTransport {
  return async () => {
    state.graphReads += 1;
    if ((fixture.outages ?? []).includes('graph')) {
      return jsonResponse({ errors: [{ message: 'schéma de graphe indisponible' }] }, 500);
    }
    return jsonResponse({
      data: { teamworkGraph: { developmentChanges: { nodes: neighborNodes(fixture) } } },
    });
  };
}
