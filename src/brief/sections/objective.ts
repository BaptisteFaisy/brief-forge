/**
 * Section 1 — Objectif.
 *
 * Le résumé du ticket et sa description, cités (donc traités comme données) et
 * datés de la dernière mise à jour du ticket.
 */

import { sanitizeTicketContent } from '../../security';
import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Objectif' as const;

/** Texte brut de l'objectif (champ `objective` de `BriefData`). */
export function objectiveText(input: BriefInput): string {
  const { issue } = input;
  const description = sanitizeTicketContent(issue.description, issue.reporter, issue.updatedAt);
  const body = description.trim() || '(aucune description fournie dans le ticket)';
  return `${issue.summary.trim()}\n\n${body}`;
}

export function buildObjective(input: BriefInput): SectionSpec {
  const { issue } = input;
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-work-brief',
    kind: 'quote',
    items: [sourcedItem(objectiveText(input), `Jira ${issue.issueKey}`, issue.updatedAt)],
    emptyNote: '_Aucun objectif lisible : le ticket ne porte ni résumé ni description._',
  };
}
