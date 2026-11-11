/**
 * Réglages projet par défaut + helpers déterministes partagés par la collecte.
 *
 * Le lot WP-collect ne possède que six fichiers : les helpers communs (forme
 * des charges JSON, dates, extraction des critères, requêtes HTTP typées)
 * vivent donc ici plutôt que dupliqués dans chaque client. Aucun de ces
 * helpers ne fait d'appel réseau : tout passe par un `Transport` injecté.
 */

import { BriefError, IssueNotFoundError, PermissionDeniedError } from '../util/errors';
import type { ProjectSettings, Transport } from './types';

/** Statut Jira qui déclenche la construction d'un brief (surchargé en base). */
export const DEFAULT_TRIGGER_STATUS = 'Prêt à développer';

/** Étiquettes Confluence qui marquent une page de décision. */
export const DEFAULT_DECISION_LABELS: string[] = ['decision', 'adr'];

/** Noms de champs Jira susceptibles de porter les critères d'acceptation. */
export const ACCEPTANCE_CRITERIA_FIELD_ALIASES: string[] = [
  'acceptance criteria',
  "critères d'acceptation",
  'criteres d acceptation',
  'definition of done',
];

export function defaultProjectSettings(
  projectKey: string,
  projectId?: string
): ProjectSettings {
  return {
    projectId: projectId ?? projectKey,
    projectKey,
    triggerStatus: DEFAULT_TRIGGER_STATUS,
    decisionLabels: [...DEFAULT_DECISION_LABELS],
  };
}

/* ------------------------------------------------------------------ *
 * Helpers de forme (charges JSON non typées venant d'Atlassian)
 * ------------------------------------------------------------------ */

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).map(asString).filter((item) => item !== '');
}

/** Accès sûr à une propriété imbriquée : `dig(raw, 'fields', 'status', 'name')`. */
export function dig(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)[key];
    if (current === undefined) return undefined;
  }
  return current;
}

/** Rend un champ Jira (texte, nombre, liste, objet) sous forme de texte. */
export function stringifyFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map(stringifyFieldValue)
      .filter((item) => item !== '')
      .join(', ');
  }
  const record = asRecord(value);
  return asString(
    record.value ?? record.name ?? record.displayName ?? record.key
  );
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/** Normalise une date Jira/Confluence en ISO 8601 ; chaîne vide si invalide. */
export function parseIsoDate(value: unknown): string {
  const raw = asString(value).trim();
  if (raw === '') return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function isoDaysAgo(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/* ------------------------------------------------------------------ *
 * Critères d'acceptation
 * ------------------------------------------------------------------ */

const CRITERIA_HEADING =
  /(acceptance\s+criteria|crit[èe]res?\s+d[’']acceptation|definition\s+of\s+done|\bdod\b)/i;
const LIST_ITEM = /^\s*(?:[-*+]\s+(?:\[[ x]\]\s*)?|\d+[.)]\s+)(.+)$/;
const GIVEN_WHEN_THEN = /^\s*(?:given|when|then|étant donné|quand|alors)\b/i;
const ANY_HEADING = /^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$)/;

/** Vrai si le nom d'un champ Jira désigne les critères d'acceptation. */
export function matchesCriteriaFieldName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  if (normalized === '') return false;
  return ACCEPTANCE_CRITERIA_FIELD_ALIASES.some((alias) =>
    normalized.includes(alias)
  );
}

/**
 * Extrait les critères d'acceptation d'un texte tiers : section dédiée si elle
 * existe (puis liste à puces), sinon tous les items de liste / blocs
 * Given-When-Then du texte.
 */
export function extractAcceptanceCriteria(text: string, max = 15): string[] {
  if (text === '') return [];
  const lines = text.split(/\r?\n/);
  const fromSection = criteriaFromSection(lines, max);
  if (fromSection.length > 0) return fromSection;
  return criteriaFromListItems(lines, max);
}

export function hasAcceptanceCriteria(text: string): boolean {
  return extractAcceptanceCriteria(text).length > 0;
}

/** Vrai si le texte contient un intitulé « critères d'acceptation » / DoD. */
export function hasCriteriaHeading(text: string): boolean {
  return text !== '' && CRITERIA_HEADING.test(text);
}

function criteriaFromSection(lines: string[], max: number): string[] {
  const start = lines.findIndex((line) => CRITERIA_HEADING.test(line));
  if (start === -1) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (items.length >= max) break;
    const match = LIST_ITEM.exec(line);
    if (match) {
      items.push(match[1].trim());
      continue;
    }
    if (items.length > 0 && line.trim() === '') break;
    if (items.length > 0 && ANY_HEADING.test(line)) break;
  }
  return items;
}

function criteriaFromListItems(lines: string[], max: number): string[] {
  const items: string[] = [];
  for (const line of lines) {
    if (items.length >= max) break;
    const match = LIST_ITEM.exec(line);
    if (match) {
      items.push(match[1].trim());
      continue;
    }
    if (GIVEN_WHEN_THEN.test(line)) items.push(line.trim());
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Requêtes HTTP typées (aucun appel réseau direct : transport injecté)
 * ------------------------------------------------------------------ */

export function httpErrorFor(status: number, issueKey: string): Error {
  if (status === 401 || status === 403) return new PermissionDeniedError(issueKey);
  if (status === 404) return new IssueNotFoundError(issueKey);
  return new BriefError(
    'INTERNAL_ERROR',
    `Réponse Atlassian inattendue (HTTP ${status}) pour ${issueKey}.`,
    { status, issueKey }
  );
}

/** GET JSON via un transport injecté, avec erreurs typées (BC-09). */
export async function requestJson(
  transport: Transport,
  path: string,
  issueKey: string
): Promise<unknown> {
  const response = await transport(path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw httpErrorFor(response.status, issueKey);
  return response.json();
}
