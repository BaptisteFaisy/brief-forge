/**
 * Repo `claim` : réservation d'un ticket par un agent pendant 4 h
 * (`CLAIM_EXPIRY_HOURS`). Une réservation expirée est ignorée à la lecture :
 * elle ne bloque plus personne, même si la ligne existe encore en base.
 */

import { CLAIM_EXPIRY_HOURS } from '../config';
import { ClaimRecord, ClaimRow } from './types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import { CLAIM_COLUMNS, claimToParams, rowToClaim } from './mappers';
import { buildUpsert, isExpired, toIso, withDbError } from './helpers';

const UPSERT_CLAIM = buildUpsert(TABLES.claim, CLAIM_COLUMNS, ['issue_key']);

/** Échéance par défaut d'une réservation (maintenant + 4 h). */
export function defaultClaimExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + CLAIM_EXPIRY_HOURS * 3600 * 1000).toISOString();
}

/** Pose (ou renouvelle) la réservation d'un ticket. */
export async function saveClaim(claim: ClaimRecord): Promise<void> {
  const normalized: ClaimRecord = { ...claim, expiresAt: toIso(claim.expiresAt) };
  await withDbError('saveClaim', () =>
    getSqlClient().execute(UPSERT_CLAIM, claimToParams(normalized))
  );
}

/**
 * Réservation active d'un ticket ; `null` si aucune, ou si elle a expiré
 * (au-delà de 4 h, le ticket redevient libre).
 */
export async function loadActiveClaim(
  issueKey: string,
  now: Date = new Date()
): Promise<ClaimRecord | null> {
  const rows = await withDbError('loadActiveClaim', () =>
    getSqlClient().query<ClaimRow>(`SELECT * FROM ${TABLES.claim} WHERE issue_key = ?`, [issueKey])
  );
  if (rows.length === 0) return null;
  const claim = rowToClaim(rows[0]);
  return isExpired(claim.expiresAt, now) ? null : claim;
}

/** Libère le ticket (fin de travail ou abandon). */
export async function releaseClaim(issueKey: string): Promise<void> {
  await withDbError('releaseClaim', () =>
    getSqlClient().execute(`DELETE FROM ${TABLES.claim} WHERE issue_key = ?`, [issueKey])
  );
}
