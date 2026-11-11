/**
 * Section 4 — Déjà tenté (BC-07).
 *
 * Les tentatives échouées sont réinjectées dans chaque brief suivant, la plus
 * récente d'abord : un agent qui reprend le ticket doit savoir ce qui a déjà
 * été essayé et pourquoi ça n'a pas marché.
 */

import { sanitizeTicketContent } from '../../security';
import { AttemptRecord, BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Déjà tenté' as const;
const REPORT_EXCERPT_CHARS = 200;

/** Une tentative est « échouée » dès qu'elle n'est pas allée au bout. */
export function isFailedAttempt(attempt: AttemptRecord): boolean {
  return attempt.status !== 'terminé';
}

function reportExcerpt(attempt: AttemptRecord): string {
  const clean = sanitizeTicketContent(attempt.reportMd, attempt.agentName, attempt.startedAt)
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= REPORT_EXCERPT_CHARS) return clean;
  return `${clean.slice(0, REPORT_EXCERPT_CHARS).trimEnd()}…`;
}

/** Tentatives échouées, les plus récentes d'abord (BC-07). */
export function failedAttempts(attempts: AttemptRecord[]): AttemptRecord[] {
  return attempts
    .filter(isFailedAttempt)
    .slice()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function attemptItems(attempts: AttemptRecord[]): ReturnType<typeof sourcedItem>[] {
  return failedAttempts(attempts).map((attempt) => {
    const excerpt = reportExcerpt(attempt);
    const tests = attempt.testsPassed ? ` (tests : ${attempt.testsPassed})` : '';
    const text = excerpt
      ? `Tentative ${attempt.agentName} — ${attempt.status} : ${excerpt}${tests}`
      : `Tentative ${attempt.agentName} — ${attempt.status}${tests}`;
    return sourcedItem(text, `Tentative ${attempt.id}`, attempt.startedAt);
  });
}

export function buildAlreadyTried(input: BriefInput): SectionSpec {
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-failed-attempts',
    kind: 'bullets',
    items: attemptItems(input.attempts),
    emptyNote: '_Aucune tentative précédente enregistrée sur ce ticket._',
  };
}
