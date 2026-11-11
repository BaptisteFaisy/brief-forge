/**
 * Repo `access_log` : trace des accès (ticket, outil, utilisateur, date).
 * Alimente l'audit et la rétention de 90 jours (`ACCESS_LOG_RETENTION_DAYS`).
 */

import { ACCESS_LOG_RETENTION_DAYS } from '../config';
import { AccessLogRecord, AccessLogRow } from './types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import { ACCESS_LOG_COLUMNS, accessLogToParams, rowToAccessLog } from './mappers';
import { newId, toIso, withDbError } from './helpers';

const INSERT_ACCESS_LOG = `INSERT INTO ${TABLES.accessLog} (${ACCESS_LOG_COLUMNS.join(
  ', '
)}) VALUES (?, ?, ?, ?, ?)`;

/** Journalise un accès à un ticket via un outil MCP. */
export async function logAccess(
  issueKey: string,
  tool: string,
  userAccountId: string,
  at: string
): Promise<void> {
  const entry: AccessLogRecord = {
    id: newId(),
    issueKey,
    tool,
    userAccountId,
    at: toIso(at),
  };
  await withDbError('logAccess', () =>
    getSqlClient().execute(INSERT_ACCESS_LOG, accessLogToParams(entry))
  );
}

/** Derniers accès d'un ticket, les plus récents d'abord (audit). */
export async function loadAccessLog(issueKey: string, limit = 100): Promise<AccessLogRecord[]> {
  const rows = await withDbError('loadAccessLog', () =>
    getSqlClient().query<AccessLogRow>(
      `SELECT * FROM ${TABLES.accessLog} WHERE issue_key = ? ORDER BY at DESC LIMIT ?`,
      [issueKey, limit]
    )
  );
  return rows.map(rowToAccessLog);
}

/**
 * Purge les traces plus anciennes que la rétention (90 j).
 * @returns nombre de lignes supprimées, si le client le renvoie
 */
export async function purgeOldAccessLogs(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(
    now.getTime() - ACCESS_LOG_RETENTION_DAYS * 24 * 3600 * 1000
  ).toISOString();
  await withDbError('purgeOldAccessLogs', () =>
    getSqlClient().execute(`DELETE FROM ${TABLES.accessLog} WHERE at < ?`, [cutoff])
  );
}
