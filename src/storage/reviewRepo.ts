/**
 * Repo `review` : revues de tentative (verdict + commentaire).
 * La table est au modèle (§ 14) mais aucune fonction du contrat § 4.4 ne
 * l'expose : on fournit l'accès minimal, réutilisé par les outils d'audit.
 */

import { ReviewRecord, ReviewRow } from './types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import { REVIEW_COLUMNS, reviewToParams, rowToReview } from './mappers';
import { buildUpsert, withDbError } from './helpers';

const UPSERT_REVIEW = buildUpsert(TABLES.review, REVIEW_COLUMNS, ['id']);

/** Enregistre une revue (id fourni par l'appelant). */
export async function saveReview(review: ReviewRecord): Promise<void> {
  await withDbError('saveReview', () =>
    getSqlClient().execute(UPSERT_REVIEW, reviewToParams(review))
  );
}

/** Revues d'un ticket, les plus récentes d'abord. */
export async function loadReviews(issueKey: string): Promise<ReviewRecord[]> {
  const rows = await withDbError('loadReviews', () =>
    getSqlClient().query<ReviewRow>(
      `SELECT * FROM ${TABLES.review} WHERE issue_key = ? ORDER BY created_at DESC`,
      [issueKey]
    )
  );
  return rows.map(rowToReview);
}
