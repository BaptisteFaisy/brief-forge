/**
 * Client Jira de la collecte (lecture seule, au nom de l'utilisateur appelant).
 *
 * Toutes les requêtes passent par un `Transport` injecté : en production il est
 * construit sur `asUser().requestJira(...)` (voir issueCollector), en test sur
 * une doublure. Aucun appel réseau n'est fait ici en dehors de ce transport.
 *
 * On interroge l'API REST v2 pour obtenir le corps des descriptions et des
 * commentaires en texte brut (la v3 renvoie de l'ADF, converti au besoin).
 */

import { sanitizeTicketContent } from '../security';
import {
  asArray,
  asRecord,
  asString,
  asStringArray,
  dig,
  extractAcceptanceCriteria,
  hasCriteriaHeading,
  matchesCriteriaFieldName,
  parseIsoDate,
  requestJson,
  stringifyFieldValue,
} from './settingsDefaults';
import type {
  IssueComment,
  IssueHistoryEntry,
  IssueLink,
  IssueSnapshot,
  JiraClient,
  Transport,
} from './types';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const API = '/rest/api/2';
const CLOSED_STATUSES = [
  'done',
  'closed',
  'résolu',
  'resolu',
  'fermé',
  'ferme',
  'terminé',
  'termine',
];

export interface ParseIssueOptions {
  /** Identifiant du champ personnalisé portant les critères, s'il est connu. */
  acceptanceCriteriaField?: string;
  /** Table `customfield_xxxxx` -> nom lisible, issue de `/rest/api/2/field`. */
  fieldNames?: Record<string, string>;
}

export function createJiraClient(transport: Transport): JiraClient {
  return {
    fetchIssue: async (issueKey) =>
      asRecord(
        await requestJson(
          transport,
          `${API}/issue/${encodeURIComponent(issueKey)}?fields=*all`,
          issueKey
        )
      ),
    fetchComments: (issueKey) =>
      fetchPaged(
        transport,
        `${API}/issue/${encodeURIComponent(issueKey)}/comment`,
        issueKey,
        'comments'
      ),
    fetchChangelog: (issueKey) =>
      fetchPaged(
        transport,
        `${API}/issue/${encodeURIComponent(issueKey)}/changelog`,
        issueKey,
        'values'
      ),
    fetchProject: async (projectKey) =>
      asRecord(
        await requestJson(
          transport,
          `${API}/project/${encodeURIComponent(projectKey)}`,
          projectKey
        )
      ),
    fetchFields: async () => asArray(await requestJson(transport, `${API}/field`, 'fields')),
    fetchDevStatus: (issueId) => fetchDevStatus(transport, issueId),
    resolveIssueId: async (issueKey) =>
      asString(
        asRecord(
          await requestJson(
            transport,
            `${API}/issue/${encodeURIComponent(issueKey)}?fields=id`,
            issueKey
          )
        ).id
      ),
  };
}

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

async function fetchPaged(
  transport: Transport,
  basePath: string,
  issueKey: string,
  collection: 'comments' | 'values'
): Promise<unknown[]> {
  const items: unknown[] = [];
  let startAt = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = asRecord(
      await requestJson(
        transport,
        `${basePath}?startAt=${startAt}&maxResults=${PAGE_SIZE}`,
        issueKey
      )
    );
    const batch = asArray(payload[collection]);
    items.push(...batch);
    startAt += batch.length;
    const total = Number(payload.total ?? items.length);
    if (batch.length === 0 || startAt >= total) break;
  }
  return items;
}

/** Information de développement Jira (repli quand le Teamwork Graph est muet). */
async function fetchDevStatus(
  transport: Transport,
  issueId: string
): Promise<Record<string, unknown>> {
  const base = `/rest/dev-status/latest/issue/detail?issueId=${encodeURIComponent(issueId)}`;
  const pullRequests = await requestJson(
    transport,
    `${base}&applicationType=stash&dataType=pullrequest`,
    issueId
  );
  const commits = await requestJson(
    transport,
    `${base}&applicationType=stash&dataType=repository`,
    issueId
  );
  return { pullRequests, commits };
}

/* ------------------------------------------------------------------ *
 * Analyse de la charge ticket
 * ------------------------------------------------------------------ */

export function parseIssueSnapshot(
  raw: Record<string, unknown>,
  options: ParseIssueOptions = {}
): IssueSnapshot {
  const fields = asRecord(raw.fields);
  const author = personName(fields.reporter) || 'inconnu';
  const createdAt = parseIsoDate(fields.created);
  const description = adfToText(fields.description);
  const customFields = collectCustomFields(fields, options.fieldNames);
  const issueKey = asString(raw.key);
  return {
    issueKey,
    projectKey:
      asString(dig(fields, 'project', 'key')) || projectKeyOf(issueKey),
    summary: sanitizeTicketContent(asString(fields.summary), author, createdAt),
    description: sanitizeTicketContent(description, author, createdAt),
    status: asString(dig(fields, 'status', 'name')),
    issueType: asString(dig(fields, 'issuetype', 'name')),
    components: asStringArray(
      asArray(fields.components).map((component) => asString(asRecord(component).name))
    ),
    labels: asStringArray(fields.labels),
    reporter: personName(fields.reporter),
    assignee: personName(fields.assignee),
    createdAt,
    updatedAt: parseIsoDate(fields.updated),
    epicKey: epicKeyOf(fields, customFields),
    acceptanceCriteria: criteriaOf(fields, customFields, description, options)
      .map((criterion) => sanitizeTicketContent(criterion, author, createdAt)),
    links: parseLinks(fields.issuelinks),
    comments: parseComments(dig(fields, 'comment', 'comments')),
    history: [],
    customFields,
  };
}

export function parseComments(value: unknown): IssueComment[] {
  return asArray(value)
    .map((raw) => {
      const comment = asRecord(raw);
      const author = personName(comment.author) || 'inconnu';
      const createdAt = parseIsoDate(comment.created);
      return {
        id: asString(comment.id),
        author,
        createdAt,
        body: sanitizeTicketContent(adfToText(comment.body), author, createdAt),
        visibility: commentVisibility(comment),
      };
    })
    .filter((comment) => comment.id !== '');
}

export function parseHistory(value: unknown): IssueHistoryEntry[] {
  const entries: IssueHistoryEntry[] = [];
  for (const raw of asArray(value)) {
    const history = asRecord(raw);
    const at = parseIsoDate(history.created);
    const author = personName(history.author) || 'inconnu';
    for (const change of asArray(history.items)) {
      const entry = historyEntryFrom(change, at, author);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function historyEntryFrom(
  value: unknown,
  at: string,
  author: string
): IssueHistoryEntry | undefined {
  const change = asRecord(value);
  const field = asString(change.field).toLowerCase();
  const from = asString(change.fromString);
  const to = asString(change.toString);
  if (field === 'issuelinks' || field === 'link') {
    return { at, author, kind: 'linked', summary: `lien modifié (${from || '—'} → ${to || '—'})` };
  }
  if (field !== 'status') return undefined;
  const kind = statusChangeKind(from, to);
  return { at, author, kind, summary: `statut ${from || '—'} → ${to || '—'}` };
}

function statusChangeKind(from: string, to: string): IssueHistoryEntry['kind'] {
  const closed = (status: string): boolean =>
    CLOSED_STATUSES.includes(status.toLowerCase().trim());
  if (!closed(from) && closed(to)) return 'closed';
  if (closed(from) && !closed(to)) return 'reopened';
  return 'status';
}

function parseLinks(value: unknown): IssueLink[] {
  const links: IssueLink[] = [];
  for (const raw of asArray(value)) {
    const link = asRecord(raw);
    const outward = asRecord(link.outwardIssue);
    const inward = asRecord(link.inwardIssue);
    const target = asString(outward.key) !== '' ? outward : inward;
    const key = asString(target.key);
    if (key === '') continue;
    links.push({
      type: asString(dig(link, 'type', 'name')) || 'lien',
      key,
      direction: asString(outward.key) !== '' ? 'outward' : 'inward',
      status: asString(dig(target, 'fields', 'status', 'name')) || undefined,
      title: asString(dig(target, 'fields', 'summary')) || undefined,
    });
  }
  return links;
}

function commentVisibility(comment: Record<string, unknown>): 'public' | 'restricted' {
  const visibility = asRecord(comment.visibility);
  const restrictedByVisibility =
    asString(visibility.type) !== '' || asString(visibility.value) !== '';
  if (restrictedByVisibility || comment.jsdPublic === false) return 'restricted';
  return 'public';
}

/* ------------------------------------------------------------------ *
 * Champs personnalisés, épique, critères
 * ------------------------------------------------------------------ */

export function collectCustomFields(
  fields: Record<string, unknown>,
  fieldNames: Record<string, string> = {}
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, value] of Object.entries(fields)) {
    if (!id.startsWith('customfield_')) continue;
    const text = stringifyFieldValue(value);
    if (text === '') continue;
    result[fieldNames[id] ?? id] = text;
  }
  return result;
}

/** Trouve l'identifiant du champ personnalisé « critères d'acceptation ». */
export function findAcceptanceCriteriaField(fields: unknown[]): string | undefined {
  for (const raw of fields) {
    const field = asRecord(raw);
    const id = asString(field.id);
    if (id.startsWith('customfield_') && matchesCriteriaFieldName(asString(field.name))) {
      return id;
    }
  }
  return undefined;
}

export function fieldNameMap(fields: unknown[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const raw of fields) {
    const field = asRecord(raw);
    const id = asString(field.id);
    const name = asString(field.name);
    if (id !== '' && name !== '') map[id] = name;
  }
  return map;
}

function criteriaOf(
  fields: Record<string, unknown>,
  customFields: Record<string, string>,
  description: string,
  options: ParseIssueOptions
): string[] {
  const fieldId = options.acceptanceCriteriaField ?? criteriaFieldKey(customFields);
  const fromField =
    fieldId === undefined
      ? []
      : extractAcceptanceCriteria(
          customFields[fieldId] ?? stringifyFieldValue(fields[fieldId])
        );
  return fromField.length > 0 ? fromField : extractAcceptanceCriteria(description);
}

/**
 * Trouve le champ personnalisé qui porte les critères : d'abord par son nom,
 * sinon par son contenu (intitulé « critères d'acceptation »), ce qui couvre le
 * cas où la table des noms de champs n'est pas accessible.
 */
function criteriaFieldKey(customFields: Record<string, string>): string | undefined {
  const byName = Object.keys(customFields).find((name) =>
    matchesCriteriaFieldName(name)
  );
  if (byName !== undefined) return byName;
  return Object.keys(customFields).find((name) =>
    hasCriteriaHeading(customFields[name])
  );
}

function epicKeyOf(
  fields: Record<string, unknown>,
  customFields: Record<string, string>
): string | undefined {
  const parent = asString(dig(fields, 'parent', 'key'));
  if (parent !== '') return parent;
  const epicEntry = Object.entries(customFields).find(([name]) =>
    /epic\s*link/i.test(name)
  );
  return epicEntry && epicEntry[1] !== '' ? epicEntry[1] : undefined;
}

function personName(value: unknown): string {
  const person = asRecord(value);
  return asString(person.displayName) || asString(person.name) || asString(person.accountId);
}

function projectKeyOf(issueKey: string): string {
  const separator = issueKey.indexOf('-');
  return separator > 0 ? issueKey.slice(0, separator) : issueKey;
}

/** Convertit un corps Atlassian Document Format en texte lisible. */
export function adfToText(value: unknown): string {
  if (typeof value === 'string') return value;
  const node = asRecord(value);
  const type = asString(node.type);
  if (type === 'text') return asString(node.text);
  if (type === 'hardBreak') return '\n';
  const children = asArray(node.content).map(adfToText).join('');
  if (type === 'paragraph' || type === 'heading' || type === 'listItem') {
    return `${children}\n`;
  }
  return children;
}
