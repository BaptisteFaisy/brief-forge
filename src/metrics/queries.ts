/**
 * Lectures projet des tables, pour les indicateurs (§ 18).
 *
 * Les tables sont indexées par ticket (`issue_key`), jamais par projet : le
 * filtrage projet passe donc sur le préfixe de la clé (`LIKE 'PAY-%'`), comme
 * le fait déjà `loadProjectReadiness` dans `src/actions/readHelpers.ts`. Les
 * jokers `_`, `%` et `\` d'une clé de projet sont échappés : `OPS_2` ne doit
 * pas matcher `OPSX2`.
 *
 * Les lignes brutes sont converties par les mappers de `src/storage/mappers.ts`
 * (une seule implémentation par table) et les erreurs enveloppées par
 * `withDbError` : aucun appelant ne voit une trace SQL interne.
 */

import { withDbError } from '../storage/helpers';
import {
  rowToAccessLog,
  rowToAttempt,
  rowToBrief,
  rowToReadiness,
  rowToReview,
} from '../storage/mappers';
import { TABLES } from '../storage/schema';
import { getSqlClient } from '../storage/sqlClient';
import type {
  AccessLogRecord,
  AccessLogRow,
  AttemptRecord,
  AttemptRow,
  BriefRow,
  ReadinessRow,
  ReviewRecord,
  ReviewRow,
  StoredBrief,
} from '../storage/types';
import type { ReadinessScore } from '../types';

/** Préfixe `LIKE` d'un projet, jokers échappés (`\` est l'échappement MySQL). */
export function projectLikePattern(projectKey: string): string {
  const escaped = (projectKey ?? '').replace(/[\\%_]/g, (char) => `\\${char}`);
  return `${escaped}-%`;
}

/** Lignes d'une table dont le ticket appartient au projet. */
async function queryProjectRows<Row>(
  operation: string,
  table: string,
  projectKey: string
): Promise<Row[]> {
  return withDbError(operation, () =>
    getSqlClient().query<Row>(`SELECT * FROM ${table} WHERE issue_key LIKE ?`, [
      projectLikePattern(projectKey),
    ])
  );
}

/** Revues des tickets du projet. */
export async function loadProjectReviews(projectKey: string): Promise<ReviewRecord[]> {
  const rows = await queryProjectRows<ReviewRow>('loadProjectReviews', TABLES.review, projectKey);
  return rows.map(rowToReview);
}

/** Tentatives (comptes rendus) des tickets du projet. */
export async function loadProjectAttempts(projectKey: string): Promise<AttemptRecord[]> {
  const rows = await queryProjectRows<AttemptRow>('loadProjectAttempts', TABLES.attempt, projectKey);
  return rows.map(rowToAttempt);
}

/** Traces d'accès aux outils du projet (rétention 90 jours). */
export async function loadProjectAccessLog(projectKey: string): Promise<AccessLogRecord[]> {
  const rows = await queryProjectRows<AccessLogRow>(
    'loadProjectAccessLog',
    TABLES.accessLog,
    projectKey
  );
  return rows.map(rowToAccessLog);
}

/** Briefs stockés du projet (un enregistrement par couple ticket × budget). */
export async function loadProjectBriefs(projectKey: string): Promise<StoredBrief[]> {
  const rows = await queryProjectRows<BriefRow>('loadProjectBriefs', TABLES.brief, projectKey);
  return rows.map(rowToBrief);
}

/** Derniers scores de préparation des tickets du projet. */
export async function loadProjectReadiness(projectKey: string): Promise<ReadinessScore[]> {
  const rows = await queryProjectRows<ReadinessRow>(
    'loadProjectReadiness',
    TABLES.readiness,
    projectKey
  );
  return rows.map(rowToReadiness);
}
