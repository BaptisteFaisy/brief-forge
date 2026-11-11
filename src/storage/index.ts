/**
 * Couche de stockage (WP-storage) : point d'entrée unique.
 *
 * Les autres modules n'importent que ce fichier : ils ne connaissent ni les
 * tables, ni les colonnes, ni le client SQL.
 */

export * from './types';
export {
  createForgeSqlClient,
  getSqlClient,
  resetSqlClient,
  setSqlClient,
} from './sqlClient';
export type { ForgeSqlApi, ForgeSqlStatement, SqlClient, SqlParam, SqlResult } from './sqlClient';
export { SCHEMA_STATEMENTS, TABLES, ensureSchema } from './schema';
export type { TableName } from './schema';
export { hasStaleBrief, loadBrief, markBriefStale, saveBrief } from './briefRepo';
export { loadReadiness, saveReadiness } from './readinessRepo';
export { loadAttempt, loadAttempts, saveAttempt } from './attemptRepo';
export { loadLessons, loadProjectLessons, saveLesson } from './lessonRepo';
export { defaultClaimExpiry, loadActiveClaim, releaseClaim, saveClaim } from './claimRepo';
export { loadAccessLog, logAccess, purgeOldAccessLogs } from './accessLogRepo';
export { loadProjectSettings, saveProjectSettings } from './projectSettingsRepo';
export { loadReviews, saveReview } from './reviewRepo';
