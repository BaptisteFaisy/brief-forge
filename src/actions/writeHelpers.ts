/**
 * Helpers partagés des quatre outils d'écriture (`ask-clarification`,
 * `post-work-report`, `record-failed-attempt`, `claim-work`).
 *
 * Trois règles tenues ici, une fois pour toutes :
 * 1. **Écritures bornées** (contrat § 4.6) : on ne sait faire que trois choses
 *    dans Jira — poster un commentaire, ajouter une étiquette, poser une
 *    propriété de ticket. Aucune fonction de ce module ne touche au statut, à
 *    l'assigné ni à la version ; ce n'est pas un réglage, c'est la forme du code.
 * 2. **Droits** : l'identité vient exclusivement du contexte Forge
 *    (`accountFromContext`), jamais des entrées de l'outil. Avant la moindre
 *    écriture, on interroge Jira avec **l'identité de l'utilisateur appelant**
 *    (`/mypermissions`) : refus explicite (`WriteForbiddenError`), zéro écriture.
 * 3. **Trace** : chaque écriture journalise l'appel (`logAccess`). Un échec de
 *    journalisation n'annule pas une écriture déjà faite : il est signalé.
 */

import { randomUUID } from 'crypto';
import api, { route, type RequestInit, type Route } from '@forge/api';
import { logAccess } from '../storage';
import { maskSecrets } from '../security/secretMasker';
import { isSafeIssueKey } from '../security/permissionGuard';
import { BriefError, IssueNotFoundError, WriteForbiddenError } from '../util/errors';
import { accountFromContext } from './shared';

/** Outil identifié dans le journal d'accès (`access_log.tool`). */
export type WriteTool =
  | 'ask-clarification'
  | 'post-work-report'
  | 'record-failed-attempt'
  | 'claim-work';

/** Droits Jira exigés avant une écriture (jamais devinés depuis les entrées). */
export const PERM_COMMENT = 'ADD_COMMENTS';
export const PERM_EDIT = 'EDIT_ISSUES';

/** Étiquette posée par `ask-clarification`. */
export const CLARIFICATION_LABEL = 'attente-precision';

/** Clé de propriété de ticket où `post-work-report` dépose son compte rendu. */
export const WORK_REPORT_PROPERTY = 'brief-forge.work-report';

/** Avertissement affiché quand le compte rendu ne cite aucun test. */
export const UNTESTED_WARNING =
  'non vérifié par des tests : aucun test n’a été lancé ni rapporté.';

/* ------------------------------------------------------------------ */
/* Port Jira (injectable : les tests doublent `@forge/api`)            */
/* ------------------------------------------------------------------ */

/** Réponse Jira réduite à ce dont les handlers ont besoin. */
export interface JiraResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

/** Trois verbes, un seul compte : le port ne sait rien faire d'autre. */
export interface JiraWritePort {
  request(method: 'GET' | 'POST' | 'PUT', path: Route, body?: unknown): Promise<JiraResponse>;
}

/** Lecture tolérante du corps JSON (204, corps vide, HTML d'erreur…). */
async function readJson(response: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Port réel : chaque appel part avec l'identité de l'utilisateur appelant. */
export function forgeWritePort(accountId: string): JiraWritePort {
  return {
    async request(method, path, body) {
      const init: RequestInit = {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      const response = await api.asUser(accountId).requestJira(path, init);
      return { ok: response.ok === true, status: response.status, data: await readJson(response) };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Identité et droits                                                  */
/* ------------------------------------------------------------------ */

/** Identité d'écriture : compte appelant + libellés d'attribution. */
export interface WriteIdentity {
  accountId: string;
  clientName?: string;
  cloudId?: string;
}

/**
 * Identité de l'appelant, lue **uniquement** dans le contexte Forge.
 * Absente ⇒ refus explicite : on n'écrit jamais au nom de personne.
 */
export function requireWriteIdentity(issueKey: string, context: unknown): WriteIdentity {
  if (!isSafeIssueKey(issueKey)) {
    throw new WriteForbiddenError(issueKey, 'clé de ticket invalide.');
  }
  const resolved = accountFromContext(context);
  const accountId = (resolved.accountId ?? '').trim();
  if (accountId === '') {
    throw new WriteForbiddenError(
      issueKey,
      'identité de l’appelant absente du contexte : aucune écriture n’est possible.'
    );
  }
  return { accountId, clientName: resolved.clientName, cloudId: resolved.cloudId };
}

/** Session d'écriture : identité vérifiée + port Jira à utiliser. */
export interface WriteSession {
  identity: WriteIdentity;
  port: JiraWritePort;
}

/**
 * Ouvre une session d'écriture : clé sûre, identité de contexte, puis contrôle
 * des droits demandés auprès de Jira (`/mypermissions`). Toute incertitude vaut
 * refus, et un refus ne produit **aucune** écriture.
 */
export async function openWriteSession(
  issueKey: string,
  context: unknown,
  permissions: string[]
): Promise<WriteSession> {
  const identity = requireWriteIdentity(issueKey, context);
  const port = forgeWritePort(identity.accountId);
  await assertPermissions(issueKey, port, permissions);
  return { identity, port };
}

async function assertPermissions(
  issueKey: string,
  port: JiraWritePort,
  permissions: string[]
): Promise<void> {
  const path = route`/rest/api/3/mypermissions?issueKey=${issueKey}&permissions=${permissions.join(',')}`;
  const response = await port.request('GET', path);
  if (!response.ok) {
    throw new WriteForbiddenError(
      issueKey,
      `Jira n’a pas pu vérifier les droits de l’appelant (HTTP ${response.status}).`
    );
  }
  const granted = grantedPermissions(response.data);
  const missing = permissions.filter((permission) => granted[permission] !== true);
  if (missing.length > 0) {
    throw new WriteForbiddenError(
      issueKey,
      `le compte appelant n’a pas les droits ${missing.join(', ')} sur ce ticket.`
    );
  }
}

/** `{ permissions: { ADD_COMMENTS: { havePermission: true } } }` → table simple. */
function grantedPermissions(data: unknown): Record<string, boolean> {
  const raw = (data as { permissions?: Record<string, { havePermission?: boolean }> } | null)
    ?.permissions;
  const granted: Record<string, boolean> = {};
  if (!raw || typeof raw !== 'object') return granted;
  for (const [key, value] of Object.entries(raw)) {
    granted[key] = value?.havePermission === true;
  }
  return granted;
}

/* ------------------------------------------------------------------ */
/* Erreurs d'écriture                                                  */
/* ------------------------------------------------------------------ */

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Traduit un échec HTTP Jira en erreur typée, lisible par l'agent. */
function jiraFailure(issueKey: string, what: string, response: JiraResponse): BriefError {
  if (response.status === 401 || response.status === 403) {
    return new WriteForbiddenError(
      issueKey,
      `Jira a refusé ${what} (HTTP ${response.status}) : les droits de l’appelant ne le permettent pas.`
    );
  }
  if (response.status === 404) return new IssueNotFoundError(issueKey);
  return new BriefError(
    'INTERNAL_ERROR',
    `Écriture impossible (${what}) sur ${issueKey} : HTTP ${response.status}.`
  );
}

/* ------------------------------------------------------------------ */
/* Écritures bornées                                                   */
/* ------------------------------------------------------------------ */

/** Commentaire posté : identifiant Jira et URL de repli. */
export interface PostedComment {
  id: string;
  self?: string;
}

/** Poste un commentaire (seule écriture de `ask-clarification`). */
export async function postComment(
  issueKey: string,
  port: JiraWritePort,
  body: AdfNode
): Promise<PostedComment> {
  const response = await port.request('POST', route`/rest/api/3/issue/${issueKey}/comment`, {
    body,
  });
  if (!response.ok) throw jiraFailure(issueKey, 'le commentaire', response);
  const data = (response.data ?? {}) as { id?: string; self?: string };
  return { id: data.id ?? '', self: data.self };
}

/** Ajoute une étiquette **sans écraser** les étiquettes existantes. */
export async function addLabel(
  issueKey: string,
  port: JiraWritePort,
  label: string
): Promise<boolean> {
  const current = await port.request(
    'GET',
    route`/rest/api/3/issue/${issueKey}?fields=labels`
  );
  if (!current.ok) throw jiraFailure(issueKey, 'la lecture des étiquettes', current);
  const existing = issueLabels(current.data);
  if (existing.includes(label)) return false;
  const labels = [...existing, label];
  const response = await port.request('PUT', route`/rest/api/3/issue/${issueKey}`, {
    fields: { labels },
  });
  if (!response.ok) throw jiraFailure(issueKey, 'l’étiquette', response);
  return true;
}

function issueLabels(data: unknown): string[] {
  const labels = (data as { fields?: { labels?: unknown } } | null)?.fields?.labels;
  if (!Array.isArray(labels)) return [];
  return labels.filter((label): label is string => typeof label === 'string');
}

/** Pose (ou remplace) une propriété de ticket : un encart, rien de plus. */
export async function setIssueProperty(
  issueKey: string,
  port: JiraWritePort,
  propertyKey: string,
  value: Record<string, unknown>
): Promise<void> {
  const path = route`/rest/api/3/issue/${issueKey}/properties/${propertyKey}`;
  const response = await port.request('PUT', path, value);
  if (!response.ok) throw jiraFailure(issueKey, 'la propriété de ticket', response);
}

/** En-tête du ticket : de qui vient la demande (pour la mention @). */
export interface IssueHeader {
  summary: string;
  reporterAccountId?: string;
  reporterName?: string;
}

/** Lit l'auteur du ticket. Aucun autre champ n'est conservé. */
export async function readIssueHeader(
  issueKey: string,
  port: JiraWritePort
): Promise<IssueHeader> {
  const path = route`/rest/api/3/issue/${issueKey}?fields=summary,reporter,creator`;
  const response = await port.request('GET', path);
  if (!response.ok) throw jiraFailure(issueKey, 'la lecture du ticket', response);
  const fields = (response.data as {
    fields?: {
      summary?: string;
      reporter?: { accountId?: string; displayName?: string };
      creator?: { accountId?: string; displayName?: string };
    };
  } | null)?.fields;
  const author = fields?.reporter ?? fields?.creator;
  return {
    summary: fields?.summary ?? '',
    reporterAccountId: author?.accountId,
    reporterName: author?.displayName,
  };
}

/* ------------------------------------------------------------------ */
/* Contenu des commentaires (ADF)                                      */
/* ------------------------------------------------------------------ */

/** Nœud Atlassian Document Format, réduit aux formes utilisées ici. */
export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  version?: number;
}

export function adfDocument(content: AdfNode[]): AdfNode {
  return { type: 'doc', version: 1, content };
}

export function textParagraph(text: string): AdfNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

/** Mention @ d'un compte Atlassian (l'auteur du ticket, par exemple). */
export function mentionNode(accountId: string, displayName?: string): AdfNode {
  const name = (displayName ?? '').trim() || accountId;
  return { type: 'mention', attrs: { id: accountId, text: `@${name}` } };
}

/** Paragraphe d'introduction mêlant une mention et du texte. */
export function mentionParagraph(accountId: string, displayName: string | undefined, suffix: string): AdfNode {
  return { type: 'paragraph', content: [mentionNode(accountId, displayName), { type: 'text', text: suffix }] };
}

/**
 * Un paragraphe par ligne non vide : le Markdown de l'agent est conservé tel
 * quel (lisible côté Jira), sans interprétation ni réécriture.
 */
export function markdownParagraphs(markdown: string): AdfNode[] {
  const lines = markdown
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return [textParagraph('(vide)')];
  return lines.map((line) => textParagraph(line));
}

/** Masque les secrets avant qu'ils n'entrent dans le ticket (BC-11). */
export function maskForWrite(text: string): string {
  return maskSecrets(text);
}

/* ------------------------------------------------------------------ */
/* Attribution, URL, journal                                           */
/* ------------------------------------------------------------------ */

/** Mention d'attribution obligatoire (contrat § 5, `SECURITY.md` § 3.5). */
export function attributionLine(clientName: string | undefined, userLabel: string): string {
  const agent = (clientName ?? '').trim() || 'agent inconnu';
  const user = userLabel.trim() || 'utilisateur inconnu';
  return `Rédigé par un agent (${agent}) pour le compte de (${user}).`;
}

/** Nom lisible de l'appelant, lu dans le contexte Forge (jamais dans les entrées). */
export function callerDisplayName(context: unknown): string {
  const raw = (context ?? {}) as Record<string, unknown>;
  const principal = (raw.principal ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    raw.displayName,
    principal.displayName,
    raw.userName,
    principal.userName,
    raw.accountId,
    principal.accountId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return 'utilisateur inconnu';
}

/** URL cliquable du commentaire (site Jira si connu, sinon URL d'API). */
export function buildCommentUrl(
  cloudId: string | undefined,
  issueKey: string,
  comment: PostedComment
): string {
  const site = (cloudId ?? '').trim();
  if (site !== '') {
    const base = `https://${site}.atlassian.net/browse/${issueKey}`;
    return comment.id ? `${base}?focusedCommentId=${comment.id}` : base;
  }
  return comment.self ?? `/browse/${issueKey}`;
}

/** Identifiant de tentative (pas d'AUTO_INCREMENT côté Forge SQL). */
export function newAttemptId(): string {
  return randomUUID();
}

/**
 * Journalise l'appel d'écriture (BC-12). Un échec de journalisation est
 * signalé mais n'annule pas l'écriture déjà effectuée côté Jira.
 */
export async function recordAccess(
  issueKey: string,
  tool: WriteTool,
  accountId: string,
  at: string = new Date().toISOString()
): Promise<void> {
  try {
    await logAccess(issueKey, tool, accountId, at);
  } catch (error) {
    console.error(`[write:${tool}] journalisation impossible pour ${issueKey} : ${message(error)}`);
  }
}
