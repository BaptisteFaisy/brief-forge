/**
 * Repo `lesson` : leçons réutilisables, stockées par projet × composant.
 *
 * `loadLessons(issueKey)` est la signature du contrat (§ 4.4) ; comme la table
 * ne connaît que (projet, composant), le projet est déduit du préfixe du ticket
 * (`PAY-142` → `PAY`) et un filtre composant optionnel permet d'affiner.
 */

import { LessonRecord, LessonRow } from './types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import { LESSON_COLUMNS, lessonToParams, rowToLesson } from './mappers';
import { buildUpsert, projectKeyFromIssueKey, withDbError } from './helpers';

const UPSERT_LESSON = buildUpsert(TABLES.lesson, LESSON_COLUMNS, ['id']);

/** Enregistre une leçon (id fourni par l'appelant). */
export async function saveLesson(lesson: LessonRecord): Promise<void> {
  await withDbError('saveLesson', () =>
    getSqlClient().execute(UPSERT_LESSON, lessonToParams(lesson))
  );
}

/**
 * Leçons applicables à un ticket, les plus récentes d'abord.
 * @param issueKey ticket source (`PAY-142`)
 * @param component composant optionnel : restreint aux leçons de ce composant
 */
export async function loadLessons(
  issueKey: string,
  component?: string
): Promise<LessonRecord[]> {
  const projectKey = projectKeyFromIssueKey(issueKey);
  const where = component ? 'project_key = ? AND component = ?' : 'project_key = ?';
  const params = component ? [projectKey, component] : [projectKey];
  const rows = await withDbError('loadLessons', () =>
    getSqlClient().query<LessonRow>(
      `SELECT * FROM ${TABLES.lesson} WHERE ${where} ORDER BY created_at DESC`,
      params
    )
  );
  return rows.map(rowToLesson);
}

/** Leçons d'un projet, tous composants confondus (outil `list-ready-work`). */
export async function loadProjectLessons(projectKey: string): Promise<LessonRecord[]> {
  const rows = await withDbError('loadProjectLessons', () =>
    getSqlClient().query<LessonRow>(
      `SELECT * FROM ${TABLES.lesson} WHERE project_key = ? ORDER BY created_at DESC`,
      [projectKey]
    )
  );
  return rows.map(rowToLesson);
}
