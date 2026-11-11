/**
 * Repo `project_settings` : réglages d'un projet, stockés en JSON dans une
 * seule colonne (le schéma des réglages évolue sans migration DDL).
 */

import { ProjectSettings, ProjectSettingsRow } from './types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import {
  PROJECT_SETTINGS_COLUMNS,
  projectSettingsToParams,
  rowToProjectSettings,
} from './mappers';
import { buildUpsert, nowIso, withDbError } from './helpers';

const UPSERT_SETTINGS = buildUpsert(TABLES.projectSettings, PROJECT_SETTINGS_COLUMNS, [
  'project_key',
]);

/** Enregistre les réglages d'un projet (sérialisés en JSON). */
export async function saveProjectSettings(
  settings: ProjectSettings,
  updatedAt: string = nowIso()
): Promise<void> {
  await withDbError('saveProjectSettings', () =>
    getSqlClient().execute(UPSERT_SETTINGS, projectSettingsToParams(settings, updatedAt))
  );
}

/**
 * Charge les réglages d'un projet ; `null` s'ils n'ont jamais été enregistrés
 * ou si le JSON stocké est illisible (réglages à ressaisir).
 */
export async function loadProjectSettings(projectKey: string): Promise<ProjectSettings | null> {
  const rows = await withDbError('loadProjectSettings', () =>
    getSqlClient().query<ProjectSettingsRow>(
      `SELECT * FROM ${TABLES.projectSettings} WHERE project_key = ?`,
      [projectKey]
    )
  );
  return rows.length > 0 ? rowToProjectSettings(rows[0]) : null;
}
