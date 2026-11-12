import { STALE_DECISION_MONTHS } from '../config';

/**
 * Dates affichables du brief.
 *
 * Le brief est rendu **dans la langue du ticket** (lot langue, `src/brief/i18n`) :
 * les mois sont donc écrits dans la langue demandée. `formatDateFr` reste la
 * porte d'entrée historique (français) et délègue à `formatDate`.
 */
export type DateLang = 'fr' | 'en';

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS: Record<DateLang, string[]> = { fr: MONTHS_FR, en: MONTHS_EN };

/** Libellé « date inconnue » dans la langue demandée. */
const UNKNOWN_DATE: Record<DateLang, string> = { fr: 'date inconnue', en: 'unknown date' };

/** Date lisible : `11 novembre 2026` (fr) / `11 November 2026` (en). */
export function formatDate(isoDate: string, lang: DateLang = 'fr'): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return UNKNOWN_DATE[lang] ?? UNKNOWN_DATE.fr;
  }
  return `${date.getDate()} ${MONTHS[lang][date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateFr(isoDate: string): string {
  return formatDate(isoDate, 'fr');
}

/**
 * Date affichable dans une source : date formatée si l'ISO est reconnue,
 * chaîne brute sinon (une date libre écrite par un humain n'est pas réécrite).
 */
export function displayDateFor(rawDate: string, lang: DateLang = 'fr'): string {
  const trimmed = (rawDate ?? '').trim();
  if (trimmed === '') return '';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return formatDate(trimmed, lang);
}

export function isStaleDecision(isoDate: string, now: Date = new Date()): boolean {
  const decisionDate = new Date(isoDate);
  if (Number.isNaN(decisionDate.getTime())) {
    return false;
  }
  const monthsDiff =
    (now.getFullYear() - decisionDate.getFullYear()) * 12 +
    (now.getMonth() - decisionDate.getMonth());
  return monthsDiff > STALE_DECISION_MONTHS;
}

export function staleLabelIfOld(isoDate: string, now: Date = new Date()): string {
  return isStaleDecision(isoDate, now) ? ' (ancienne, à confirmer)' : '';
}
