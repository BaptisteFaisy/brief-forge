/**
 * Critère « aucune question sans réponse » — 10 points.
 *
 * Une question posée dans un commentaire et restée sans réponse est une
 * décision manquante : l'agent devra la deviner. Une question est considérée
 * comme traitée dès qu'un **autre** auteur commente ensuite (réponse, précision
 * ou reformulation) : le fil a alors quelqu'un au volant.
 */

import { buildOutcome, countWords, isQuestion, normalizeText, quoteExcerpt } from '../support';
import type { CriterionInput, CriterionOutcome, IssueComment } from '../types';

const MAX_QUESTIONS_SHOWN = 2;

function byDate(a: IssueComment, b: IssueComment): number {
  return a.createdAt.localeCompare(b.createdAt);
}

/** Vrai si quelqu'un d'autre a commenté après l'index donné. */
function hasLaterReply(comments: IssueComment[], index: number, author: string): boolean {
  const authorKey = normalizeText(author);
  return comments
    .slice(index + 1)
    .some((comment) => normalizeText(comment.author) !== authorKey && countWords(comment.body) >= 2);
}

export function checkUnansweredQuestion(input: CriterionInput): CriterionOutcome {
  const comments = [...(input.comments ?? [])].sort(byDate);

  const pending = comments.filter(
    (comment, index) => isQuestion(comment.body) && !hasLaterReply(comments, index, comment.author)
  );

  if (pending.length === 0) {
    return buildOutcome('noUnansweredQuestion', true);
  }

  const shown = pending
    .slice(0, MAX_QUESTIONS_SHOWN)
    .map((comment) => `« ${quoteExcerpt(comment.body, 60)} » (${comment.author})`)
    .join(', ');
  const more = pending.length > MAX_QUESTIONS_SHOWN ? ` et ${pending.length - MAX_QUESTIONS_SHOWN} autre(s)` : '';

  return buildOutcome(
    'noUnansweredQuestion',
    false,
    `${pending.length} question(s) sans réponse dans les commentaires : ${shown}${more}.`
  );
}
