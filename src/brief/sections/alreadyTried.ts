/**
 * Section 4 — Déjà tenté (BC-07).
 *
 * Les tentatives échouées sont réinjectées dans chaque brief suivant, la plus
 * récente d'abord : un agent qui reprend le ticket doit savoir ce qui a déjà
 * été essayé et pourquoi ça n'a pas marché. Le compte rendu cité est du contenu
 * tiers (jamais traduit) ; l'ossature de la ligne est un libellé moteur.
 */

import { sanitizeTicketContent } from '../../security';
import { attemptLabel, langOf, sectionTitle, tf } from '../i18n';
import type { BriefLang } from '../labels';
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

/** Ligne d'une tentative : libellé moteur + extrait cité + résultat de tests. */
function attemptLine(attempt: AttemptRecord, lang: BriefLang): string {
  const excerpt = reportExcerpt(attempt);
  const tests = attempt.testsPassed ? tf('testsSuffix', lang, { value: attempt.testsPassed }) : '';
  const vars = { agent: attempt.agentName, status: attempt.status, excerpt, tests };
  return tf(excerpt ? 'attemptWithExcerpt' : 'attemptWithoutExcerpt', lang, vars);
}

export function attemptItems(
  attempts: AttemptRecord[],
  lang: BriefLang = 'fr'
): ReturnType<typeof sourcedItem>[] {
  return failedAttempts(attempts).map((attempt) =>
    sourcedItem(attemptLine(attempt, lang), attemptLabel(attempt.id, lang), attempt.startedAt)
  );
}

export function buildAlreadyTried(input: BriefInput): SectionSpec {
  const lang = langOf(input);
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: sectionTitle(NAME, lang),
    tool: 'get-failed-attempts',
    kind: 'bullets',
    lang,
    items: attemptItems(input.attempts, lang),
  };
}
