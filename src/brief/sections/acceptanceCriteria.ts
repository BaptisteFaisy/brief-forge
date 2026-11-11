/**
 * Section 2 — Critères d'acceptation.
 *
 * Source : le champ dédié du ticket, à défaut la liste portée par le snapshot.
 * Chaque critère est numéroté (l'agent cite « critère 2 » dans son compte
 * rendu) et daté de la dernière modification du ticket.
 */

import { sanitizeTicketContent } from '../../security';
import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = "Critères d'acceptation" as const;

export function criteriaLines(input: BriefInput): string[] {
  const { issue, settings } = input;
  const fromField = settings.acceptanceCriteriaField
    ? (issue.customFields[settings.acceptanceCriteriaField] ?? '')
    : '';
  const raw = fromField
    ? fromField.split(/\r?\n|;\s*/)
    : issue.acceptanceCriteria;
  return raw
    .map((line) => sanitizeTicketContent(line, issue.reporter, issue.updatedAt).trim())
    .filter((line) => line.length > 0);
}

export function buildAcceptanceCriteria(input: BriefInput): SectionSpec {
  const { issue } = input;
  const items = criteriaLines(input).map((line) =>
    sourcedItem(line, `Jira ${issue.issueKey}`, issue.updatedAt)
  );
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-acceptance-criteria',
    kind: 'criteria',
    items,
    emptyNote: '_Aucun critère d\'acceptation dans le ticket : à obtenir avant de coder._',
  };
}
