/**
 * Section 9 — Trous (BC-03).
 *
 * On signale ce que le brief n'a **pas** trouvé, pour qu'aucun agent ne le
 * comble en inventant. Un trou est une question à poser, pas une hypothèse.
 * Chaque trou est un libellé produit par le moteur : il est rendu dans la
 * langue du ticket.
 */

import { formatDate } from '../../util/dates';
import { langOf, sectionTitle, t, tf } from '../i18n';
import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';
import { criteriaLines } from './acceptanceCriteria';
import { failedAttempts } from './alreadyTried';

const NAME = 'Trous' as const;
const MAX_DISCARDED_LISTED = 3;

/**
 * Un contenu écarté par la couche de sécurité (instruction adressée à un
 * agent) ne doit pas disparaître en silence : le brief dit **combien** de
 * passages ont été retirés, de qui et de quand, sans jamais les reproduire
 * (§ 13 : « retiré et remplacé par "contenu écarté…" » ; BC-03 : signaler
 * plutôt que combler).
 */
export function discardedNotices(input: BriefInput): string[] {
  const lang = langOf(input);
  const discarded = (input.issue.comments ?? []).filter((comment) => comment.discarded);
  if (discarded.length === 0) return [];
  const listed = discarded
    .slice(0, MAX_DISCARDED_LISTED)
    .map((comment) => `${comment.author}, ${formatDate(comment.createdAt, lang)}`)
    .join(' ; ');
  const extra = discarded.length - MAX_DISCARDED_LISTED;
  const tail = extra > 0 ? tf('discardedTail', lang, { extra }) : '';
  return [tf('discardedNotice', lang, { count: discarded.length, listed, tail })];
}

/** Liste brute des trous détectés dans les données collectées. */
export function gapList(input: BriefInput): string[] {
  const { issue, settings, decisions, neighbors, lessons } = input;
  const lang = langOf(input);
  const gaps: string[] = [];
  if (criteriaLines(input).length === 0) gaps.push(t('gapCriteria', lang));
  if (decisions.length === 0) gaps.push(t('gapDecisions', lang));
  if (neighbors.length === 0) gaps.push(t('gapNeighbors', lang));
  if (failedAttempts(input.attempts).length === 0) gaps.push(t('gapAttempts', lang));
  if (lessons.length === 0) gaps.push(t('gapLessons', lang));
  if (!issue.assignee) gaps.push(t('gapAssignee', lang));
  if (issue.components.length === 0 && !settings.componentZone) gaps.push(t('gapComponent', lang));
  for (const error of input.errors ?? []) {
    gaps.push(tf('gapCollect', lang, { error }));
  }
  gaps.push(...discardedNotices(input));
  return gaps;
}

export function buildGaps(input: BriefInput, builtAt: string): SectionSpec {
  const lang = langOf(input);
  const source = t('gapsSource', lang);
  const items = gapList(input).map((gap) => sourcedItem(gap, source, builtAt));
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: sectionTitle(NAME, lang),
    tool: 'check-readiness',
    kind: 'bullets',
    lang,
    items,
  };
}
