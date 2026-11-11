/**
 * Repo `readiness` : score de préparation courant d'un ticket.
 * Un seul enregistrement par ticket : le dernier calcul écrase le précédent
 * (l'historique des scores n'est pas demandé par le produit).
 */

import { ReadinessScore } from '../types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import {
  READINESS_COLUMNS,
  readinessToParams,
  rowToReadiness,
} from './mappers';
import { ReadinessRow } from './types';
import { buildSelect, buildUpsert, withDbError } from './helpers';

const UPSERT_READINESS = buildUpsert(TABLES.readiness, READINESS_COLUMNS, ['issue_key']);

/** Enregistre le score de préparation, horodaté au moment du calcul. */
export async function saveReadiness(score: ReadinessScore, computedAt: string): Promise<void> {
  await withDbError('saveReadiness', () =>
    getSqlClient().execute(UPSERT_READINESS, readinessToParams(score, computedAt))
  );
}

/** Charge le dernier score connu d'un ticket ; `null` si jamais calculé. */
export async function loadReadiness(issueKey: string): Promise<ReadinessScore | null> {
  const rows = await withDbError('loadReadiness', () =>
    getSqlClient().query<ReadinessRow>(buildSelect(TABLES.readiness, ['issue_key']), [issueKey])
  );
  return rows.length > 0 ? rowToReadiness(rows[0]) : null;
}
