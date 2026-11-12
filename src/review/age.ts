/**
 * Âge d'une leçon.
 *
 * Une leçon a une durée de vie : au-delà d'un âge maximal elle est encore
 * renvoyée, mais marquée ancienne — c'est la section du brief qui décide de
 * l'affichage.
 *
 * `isStaleDecision` (`src/util/dates.ts`) applique la constante des 18 mois aux
 * décisions du brief ; l'âge maximal d'une leçon est **paramétrable**, donc non
 * réutilisable tel quel. La règle (écart en mois calendaires) est identique,
 * et l'âge maximal par défaut reste aligné sur `STALE_DECISION_MONTHS`.
 */

import { STALE_DECISION_MONTHS } from '../config';

/** Âge maximal par défaut d'une leçon : 18 mois, aligné sur les décisions. */
export const DEFAULT_LESSON_MAX_AGE_MONTHS = STALE_DECISION_MONTHS;

/** Écart en mois calendaires entre deux dates. */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Âge en mois d'une date ISO ; 0 si la date est illisible ou future. */
export function ageInMonths(isoDate: string, now: Date = new Date()): number {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 0;
  return Math.max(0, monthsBetween(parsed, now));
}

/** Vrai si la leçon dépasse l'âge maximal autorisé. */
export function isLessonStale(
  isoDate: string,
  now: Date = new Date(),
  maxAgeMonths: number = DEFAULT_LESSON_MAX_AGE_MONTHS
): boolean {
  return ageInMonths(isoDate, now) > maxAgeMonths;
}
