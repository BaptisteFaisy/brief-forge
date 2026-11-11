/**
 * Schéma SQL de brief-forge (modèle § 14).
 *
 * Contraintes Forge SQL respectées :
 *  - aucune clé étrangère (intégrité gérée par le code) ;
 *  - DDL **idempotent** : `CREATE TABLE IF NOT EXISTS`, index déclarés en ligne
 *    dans la table (Forge SQL n'a pas de `CREATE INDEX IF NOT EXISTS`) ;
 *  - pas d'`AUTO_INCREMENT` : les clés sont des UUID `VARCHAR(36)` générés
 *    côté application ;
 *  - une seule instruction par appel.
 *
 * Les huit tables : `brief`, `readiness`, `attempt`, `review`, `lesson`,
 * `claim`, `access_log`, `project_settings`.
 */

import { SqlClient, getSqlClient } from './sqlClient';
import { withDbError } from './helpers';

export const TABLES = {
  brief: 'brief',
  readiness: 'readiness',
  attempt: 'attempt',
  review: 'review',
  lesson: 'lesson',
  claim: 'claim',
  accessLog: 'access_log',
  projectSettings: 'project_settings',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/** Un brief par couple (ticket, budget). */
const BRIEF_DDL = `
CREATE TABLE IF NOT EXISTS brief (
  issue_key VARCHAR(64) NOT NULL,
  budget VARCHAR(1) NOT NULL,
  content_md MEDIUMTEXT NOT NULL,
  content_json MEDIUMTEXT NOT NULL,
  sources_json MEDIUMTEXT NOT NULL,
  built_at VARCHAR(32) NOT NULL,
  stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (issue_key, budget),
  KEY idx_brief_built_at (built_at)
)`;

/** Score de préparation courant d'un ticket (écrasé à chaque calcul). */
const READINESS_DDL = `
CREATE TABLE IF NOT EXISTS readiness (
  issue_key VARCHAR(64) NOT NULL,
  score INT NOT NULL,
  ready TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  gaps_json MEDIUMTEXT NOT NULL,
  advice MEDIUMTEXT NOT NULL,
  computed_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_key),
  KEY idx_readiness_ready (ready, score)
)`;

/** Tentatives de résolution, historisées. */
const ATTEMPT_DDL = `
CREATE TABLE IF NOT EXISTS attempt (
  id VARCHAR(36) NOT NULL,
  issue_key VARCHAR(64) NOT NULL,
  agent_name VARCHAR(128) NOT NULL,
  user_account_id VARCHAR(128) NOT NULL,
  started_at VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  report_md MEDIUMTEXT NOT NULL,
  criteria_covered VARCHAR(512) NOT NULL DEFAULT '',
  tests_passed VARCHAR(512) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_attempt_issue (issue_key, started_at)
)`;

/** Revues de tentative. */
const REVIEW_DDL = `
CREATE TABLE IF NOT EXISTS review (
  id VARCHAR(36) NOT NULL,
  issue_key VARCHAR(64) NOT NULL,
  attempt_id VARCHAR(36) NOT NULL,
  reviewer_name VARCHAR(128) NOT NULL,
  verdict VARCHAR(32) NOT NULL,
  comment_md MEDIUMTEXT NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_review_issue (issue_key, created_at),
  KEY idx_review_attempt (attempt_id)
)`;

/** Leçons réutilisables par projet × composant. */
const LESSON_DDL = `
CREATE TABLE IF NOT EXISTS lesson (
  id VARCHAR(36) NOT NULL,
  project_key VARCHAR(64) NOT NULL,
  component VARCHAR(128) NOT NULL DEFAULT '',
  lesson_text MEDIUMTEXT NOT NULL,
  source_attempt_id VARCHAR(36) NOT NULL DEFAULT '',
  created_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_lesson_component (project_key, component)
)`;

/** Réservation de travail : une seule ligne par ticket. */
const CLAIM_DDL = `
CREATE TABLE IF NOT EXISTS claim (
  issue_key VARCHAR(64) NOT NULL,
  agent_name VARCHAR(128) NOT NULL,
  user_account_id VARCHAR(128) NOT NULL,
  expires_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (issue_key),
  KEY idx_claim_expires (expires_at)
)`;

/** Journal d'accès (rétention applicative : 90 jours). */
const ACCESS_LOG_DDL = `
CREATE TABLE IF NOT EXISTS access_log (
  id VARCHAR(36) NOT NULL,
  issue_key VARCHAR(64) NOT NULL,
  tool VARCHAR(64) NOT NULL,
  user_account_id VARCHAR(128) NOT NULL,
  at VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_access_log_issue (issue_key, at),
  KEY idx_access_log_at (at)
)`;

/** Réglages projet, sérialisés en JSON. */
const PROJECT_SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS project_settings (
  project_key VARCHAR(64) NOT NULL,
  settings_json MEDIUMTEXT NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (project_key)
)`;

/** DDL complet, dans l'ordre de dépendance logique (aucune FK de toute façon). */
export const SCHEMA_STATEMENTS: readonly string[] = [
  BRIEF_DDL,
  READINESS_DDL,
  ATTEMPT_DDL,
  REVIEW_DDL,
  LESSON_DDL,
  CLAIM_DDL,
  ACCESS_LOG_DDL,
  PROJECT_SETTINGS_DDL,
];

/**
 * Crée les tables manquantes (idempotent, appelable à chaque démarrage).
 * Une instruction par appel, conformément à Forge SQL.
 */
export async function ensureSchema(client: SqlClient = getSqlClient()): Promise<void> {
  await withDbError('ensureSchema', async () => {
    for (const statement of SCHEMA_STATEMENTS) {
      await client.executeDdl(statement.trim());
    }
  });
}
