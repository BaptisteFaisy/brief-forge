/**
 * Helpers partagés de la couche stockage : identifiants, dates, conversions
 * SQL et construction d'`UPSERT`. Un seul endroit pour ces règles, afin que
 * les repos ne dupliquent ni le formatage ni la gestion d'erreur.
 */

import { randomUUID } from 'crypto';
import { BriefError } from '../util/errors';

/** Identifiant unique (VARCHAR(36)) — Forge SQL n'a pas d'AUTO_INCREMENT. */
export function newId(): string {
  return randomUUID();
}

/** Horodatage ISO 8601 UTC, seul format stocké en base. */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

/** Normalise une date quelconque en ISO 8601 ; laisse passer l'invalide. */
export function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** Vrai si l'échéance ISO est déjà passée (réservation expirée). */
export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= now.getTime();
}

/** `PAY-142` → `PAY` (préfixe projet, sans le numéro). */
export function projectKeyFromIssueKey(issueKey: string): string {
  const trimmed = issueKey.trim();
  const dash = trimmed.lastIndexOf('-');
  return dash > 0 ? trimmed.slice(0, dash) : trimmed;
}

/** TINYINT(1) → booléen. */
export function fromDbBool(value: number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return Number(value ?? 0) === 1;
}

/** Booléen → TINYINT(1). */
export function toDbBool(value: boolean): number {
  return value ? 1 : 0;
}

/** Sérialise en JSON compact ; `undefined`/`null` deviennent une chaîne vide. */
export function toJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/** Désérialise un JSON de colonne, avec repli sûr sur `fallback`. */
export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Construit un `INSERT ... ON DUPLICATE KEY UPDATE` (upsert MySQL/Forge SQL).
 * `keyColumns` forment la clé primaire : elles ne sont jamais réécrites.
 */
export function buildUpsert(
  table: string,
  columns: readonly string[],
  keyColumns: readonly string[]
): string {
  const placeholders = columns.map(() => '?').join(', ');
  const updated = columns.filter((column) => !keyColumns.includes(column));
  const assignments = updated.map((column) => `${column} = VALUES(${column})`).join(', ');
  const head = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  return updated.length > 0 ? `${head} ON DUPLICATE KEY UPDATE ${assignments}` : head;
}

/** Construit un `SELECT ... WHERE` sur égalités, avec tri optionnel. */
export function buildSelect(
  table: string,
  where: readonly string[],
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }
): string {
  const clause =
    where.length > 0 ? ` WHERE ${where.map((column) => `${column} = ?`).join(' AND ')}` : '';
  const order = orderBy ? ` ORDER BY ${orderBy.column} ${orderBy.direction}` : '';
  return `SELECT * FROM ${table}${clause}${order}`;
}

/**
 * Enveloppe une erreur base dans une `BriefError` typée : les handlers MCP
 * renvoient alors un refus explicite au lieu d'une trace interne.
 */
export async function withDbError<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof BriefError) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new BriefError('INTERNAL_ERROR', `Stockage indisponible (${operation}) : ${message}`, {
      operation,
    });
  }
}
