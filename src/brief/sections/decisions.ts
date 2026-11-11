/**
 * Section 3 — Décisions applicables.
 *
 * Une décision de plus de 18 mois est affichée avec la mention
 * « (ancienne, à confirmer) » (utilitaire `staleLabelIfOld`) : l'agent ne doit
 * pas la traiter comme une règle fraîche.
 */

import { sanitizeTicketContent } from '../../security';
import { staleLabelIfOld } from '../../util/dates';
import { DecisionRecord, BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Décisions applicables' as const;
const BODY_EXCERPT_CHARS = 220;

/** Première phrase utile d'une décision, citée et bornée en longueur. */
export function decisionExcerpt(decision: DecisionRecord): string {
  const clean = sanitizeTicketContent(decision.body, decision.author, decision.date)
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= BODY_EXCERPT_CHARS) return clean;
  return `${clean.slice(0, BODY_EXCERPT_CHARS).trimEnd()}…`;
}

export function decisionItems(decisions: DecisionRecord[]): ReturnType<typeof sourcedItem>[] {
  return decisions.map((decision) => {
    const excerpt = decisionExcerpt(decision);
    const label = staleLabelIfOld(decision.date);
    const text = excerpt
      ? `${decision.title.trim()} — ${excerpt}${label}`
      : `${decision.title.trim()}${label}`;
    return { ...sourcedItem(text, `Décision ${decision.author}`, decision.date), stale: Boolean(label) };
  });
}

export function buildDecisions(input: BriefInput): SectionSpec {
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-related-decisions',
    kind: 'bullets',
    items: decisionItems(input.decisions),
    emptyNote: '_Aucune décision liée retrouvée : ne pas en inventer._',
  };
}
