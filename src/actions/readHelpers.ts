/**
 * Helpers communs aux sept outils de lecture (actionVerb GET).
 *
 * Deux règles tenues ici, une fois pour toutes :
 *  1. L'identité de l'appelant vient **exclusivement** du contexte Forge
 *     (`accountFromContext` / `resolveCallerAccountId`) ; aucune entrée d'outil
 *     ne décide d'un droit (contrat § 4.5, BC-09).
 *  2. Toute lecture de ticket commence par `authorizeAndLog` : contrôle
 *     d'accès puis journalisation de l'appel (BC-12), dans cet ordre — aucune
 *     donnée ne sort avant la vérification.
 */

import { collectProjectSettings } from '../collect/issueCollector';
import type { ProjectSettings } from '../collect/types';
import { getSqlClient, loadProjectSettings, logAccess, TABLES } from '../storage';
import { sanitizeTicketContent } from '../security';
import {
  assertIssueAccessFromContext,
  isSafeIssueKey,
  resolveCallerAccountId,
} from '../security/permissionGuard';
import { ActionInputError, accountFromContext, requireString } from './shared';

/** Clé de projet Jira : `PAY`, `OPS_2`… (aucun tiret : il sépare le numéro). */
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,31}$/;

/** Ligne de « ## Raison : … » dans un compte rendu de tentative. */
const REASON_LINE = /^\s*(?:#{1,6}\s*)?(?:raison|motif|cause|reason)\s*[:：]\s*(.+)$/i;

/** Longueur maximale d'un résumé ou d'une raison renvoyés à l'agent. */
const ATTEMPT_TEXT_MAX = 200;

/** Horodatage ISO 8601 UTC, seul format échangé par les outils. */
export function isoNow(): string {
  return new Date().toISOString();
}

/**
 * `issueKey` obligatoire et de forme sûre : la clé sert aussi de segment
 * d'URL vers Jira, une forme libre ouvrirait la porte à une injection de chemin.
 */
export function requireIssueKey(payload: Record<string, unknown> | undefined): string {
  const issueKey = requireString(payload, 'issueKey').toUpperCase();
  if (!isSafeIssueKey(issueKey)) {
    throw new ActionInputError(
      `Entrée invalide : « issueKey » doit être une clé Jira du type PAY-142 (reçu : « ${issueKey} »).`
    );
  }
  return issueKey;
}

/** `projectKey` obligatoire et de forme sûre (même raison que `issueKey`). */
export function requireProjectKey(payload: Record<string, unknown> | undefined): string {
  const projectKey = requireString(payload, 'projectKey').toUpperCase();
  if (!PROJECT_KEY_PATTERN.test(projectKey)) {
    throw new ActionInputError(
      `Entrée invalide : « projectKey » doit être une clé de projet Jira du type PAY (reçu : « ${projectKey} »).`
    );
  }
  return projectKey;
}

/**
 * Vérifie l'accès au ticket puis journalise l'appel (BC-09, BC-12).
 * Le refus est explicite (`PermissionDeniedError`) et rien n'est journalisé
 * pour un accès refusé : la trace ne doit pas révéler un ticket protégé.
 */
export async function authorizeAndLog(
  issueKey: string,
  tool: string,
  context: unknown
): Promise<void> {
  await assertIssueAccessFromContext(issueKey, context);
  const accountId =
    accountFromContext(context).accountId ?? resolveCallerAccountId(context) ?? 'inconnu';
  await logAccess(issueKey, tool, accountId, isoNow());
}

/** Tri décroissant sur une date ISO ; une date illisible passe en fin de liste. */
export function sortDescByDate<T>(items: T[], dateOf: (item: T) => string): T[] {
  const time = (item: T): number => {
    const parsed = new Date(dateOf(item)).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return items.slice().sort((a, b) => time(b) - time(a));
}

function compactLine(text: string): string {
  return text.replace(/[#*_`>]/g, ' ').replace(/\s+/g, ' ').trim();
}

function clamp(text: string, max: number = ATTEMPT_TEXT_MAX): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Sépare un compte rendu de tentative en résumé et raison d'échec.
 *
 * Le compte rendu est du contenu tiers : il passe par `sanitizeTicketContent`
 * (masquage de secrets, contenu écarté s'il porte une instruction suspecte)
 * avant d'être renvoyé à l'agent appelant.
 */
export function splitAttemptReport(
  reportMd: string,
  author: string,
  date: string
): { summary: string; reason: string } {
  const clean = sanitizeTicketContent(reportMd ?? '', author, date);
  const lines = clean.split(/\r?\n/);
  const reasonMatch = lines
    .map((line) => line.match(REASON_LINE))
    .find((match): match is RegExpMatchArray => match !== null);
  const summarySource = lines.filter((line) => !REASON_LINE.test(line)).join(' ');
  return {
    summary: clamp(compactLine(summarySource)),
    reason: clamp(compactLine(reasonMatch?.[1] ?? '')),
  };
}

/**
 * Réglages du projet : collecte Jira, repli sur les réglages stockés, puis sur
 * un défaut minimal. Un projet sans réglages doit rester lisible.
 */
export async function resolveSettings(projectKey: string): Promise<ProjectSettings> {
  try {
    return await collectProjectSettings(projectKey);
  } catch {
    const stored = await loadProjectSettings(projectKey).catch(() => null);
    if (stored) return stored;
    return { projectId: projectKey, projectKey, triggerStatus: '', decisionLabels: [] };
  }
}

/** Score de préparation minimal nécessaire à `list-ready-work`. */
export interface ProjectReadinessRow {
  issueKey: string;
  score: number;
  status: string;
}

/**
 * Scores de préparation enregistrés pour un projet.
 *
 * La couche de stockage n'expose aujourd'hui qu'une lecture par ticket
 * (`loadReadiness`) : cette requête en lecture seule est donc le seul moyen de
 * lister un projet entier. Elle est isolée ici, sans écriture ni jointure, pour
 * être remplacée par un repo dédié (`readinessRepo`) dès qu'il existera —
 * aucune autre action ne fait de SQL.
 */
export async function loadProjectReadiness(projectKey: string): Promise<ProjectReadinessRow[]> {
  const rows = await getSqlClient().query<Record<string, unknown>>(
    `SELECT issue_key, score, status FROM ${TABLES.readiness} WHERE issue_key LIKE ?`,
    [`${projectKey}-%`]
  );
  return rows
    .map((row) => ({
      issueKey: String(row.issue_key ?? ''),
      score: Number(row.score ?? 0),
      status: String(row.status ?? ''),
    }))
    .filter((row) => row.issueKey !== '');
}
