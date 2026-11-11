import { STALE_DECISION_MONTHS } from '../config';

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function formatDateFr(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return 'date inconnue';
  }
  return `${date.getDate()} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
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
