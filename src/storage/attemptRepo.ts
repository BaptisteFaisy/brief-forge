/**
 * Repo `attempt` : tentatives de résolution, historisées et relues par ordre
 * chronologique inverse (les plus récentes d'abord, pour alimenter la section
 * « Déjà tenté » du brief).
 */

import { AttemptRecord } from './types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import { ATTEMPT_COLUMNS, attemptToParams, rowToAttempt } from './mappers';
import { AttemptRow } from './types';
import { buildUpsert, withDbError } from './helpers';

const UPSERT_ATTEMPT = buildUpsert(TABLES.attempt, ATTEMPT_COLUMNS, ['id']);

/** Enregistre une tentative (id fourni par l'appelant, pas d'AUTO_INCREMENT). */
export async function saveAttempt(attempt: AttemptRecord): Promise<void> {
  await withDbError('saveAttempt', () =>
    getSqlClient().execute(UPSERT_ATTEMPT, attemptToParams(attempt))
  );
}

/** Tentatives du ticket, les plus récentes d'abord. */
export async function loadAttempts(issueKey: string): Promise<AttemptRecord[]> {
  const rows = await withDbError('loadAttempts', () =>
    getSqlClient().query<AttemptRow>(
      `SELECT * FROM ${TABLES.attempt} WHERE issue_key = ? ORDER BY started_at DESC`,
      [issueKey]
    )
  );
  return rows.map(rowToAttempt);
}

/** Charge une tentative par son identifiant ; `null` si absente. */
export async function loadAttempt(attemptId: string): Promise<AttemptRecord | null> {
  const rows = await withDbError('loadAttempt', () =>
    getSqlClient().query<AttemptRow>(`SELECT * FROM ${TABLES.attempt} WHERE id = ?`, [attemptId])
  );
  return rows.length > 0 ? rowToAttempt(rows[0]) : null;
}
