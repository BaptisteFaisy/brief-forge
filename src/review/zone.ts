/**
 * Composant / zone d'un ticket.
 *
 * La table `attempt` ne porte pas de composant : la zone d'une leçon est donc
 * déduite, dans cet ordre, de ce qui est réellement disponible :
 *  1. le composant connu de l'appelant (l'encart Jira le connaît) ;
 *  2. la ligne « Composant : … » / « Zone : … » du compte rendu de la tentative ;
 *  3. la zone configurée pour le projet (`componentZone` des réglages projet) ;
 *  4. rien : la leçon devient une leçon **de projet**, valable pour tous les
 *     tickets du projet.
 *
 * Rien n'est deviné : sans zone connue, on ne fabrique pas de composant.
 */

import { normalizeText } from '../readiness/support';
import { loadProjectSettings } from '../storage';
import type { AttemptRecord } from '../storage/types';

/** Ligne « Composant : x », « Component : x » ou « Zone : x » d'un compte rendu. */
const COMPONENT_LINE = /^\s*(?:#{1,6}\s*)?(?:composant|component|zone)\s*[:：]\s*(.+)$/i;

/** Zone configurée pour le projet ; `''` si elle est inconnue. */
export async function projectZone(projectKey: string): Promise<string> {
  const settings = await loadProjectSettings(projectKey).catch(() => null);
  return (settings?.componentZone ?? '').trim();
}

/** Composant déclaré dans le compte rendu de la tentative ; `''` s'il n'y en a pas. */
export function componentFromAttempt(attempt: AttemptRecord | null): string {
  if (!attempt) return '';
  for (const line of (attempt.reportMd ?? '').split(/\r?\n/)) {
    const match = COMPONENT_LINE.exec(line);
    if (!match) continue;
    const value = (match[1] ?? '').replace(/^[`*\s]+/, '').replace(/[`*\s]+$/, '').trim();
    if (value) return value;
  }
  return '';
}

/** Vrai si deux composants désignent la même zone (casse et accents ignorés). */
export function sameComponent(left: string, right: string): boolean {
  return normalizeText(left ?? '') === normalizeText(right ?? '');
}

/**
 * Vrai si une leçon de la zone `lessonComponent` s'applique à un ticket de la
 * zone `target` : une leçon sans composant vaut pour tout le projet, une leçon
 * de composant ne vaut que pour ce composant.
 */
export function appliesToComponent(lessonComponent: string, target: string): boolean {
  const lessonZone = (lessonComponent ?? '').trim();
  if (!lessonZone) return true;
  if (!target) return false;
  return sameComponent(lessonZone, target);
}
