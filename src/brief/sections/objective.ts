/**
 * Section 1 — Objectif.
 *
 * Le résumé du ticket et sa description, cités (donc traités comme données) et
 * datés de la dernière mise à jour du ticket. Le contenu tiers n'est jamais
 * traduit : seule la mention d'absence de description est un libellé moteur.
 */

import { sanitizeTicketContent } from '../../security';
import { jiraLabel, langOf, sectionTitle, t } from '../i18n';
import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Objectif' as const;

/** Texte brut de l'objectif (champ `objective` de `BriefData`). */
export function objectiveText(input: BriefInput): string {
  const { issue } = input;
  const description = sanitizeTicketContent(issue.description, issue.reporter, issue.updatedAt);
  const body = description.trim() || t('noDescription', langOf(input));
  return `${issue.summary.trim()}\n\n${body}`;
}

export function buildObjective(input: BriefInput): SectionSpec {
  const { issue } = input;
  const lang = langOf(input);
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: sectionTitle(NAME, lang),
    tool: 'get-work-brief',
    kind: 'quote',
    lang,
    items: [
      sourcedItem(objectiveText(input), jiraLabel(issue.issueKey, lang), issue.updatedAt),
    ],
  };
}
