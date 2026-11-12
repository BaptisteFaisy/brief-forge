/**
 * Section 3 — Décisions applicables.
 *
 * Une décision de plus de 18 mois est affichée avec la mention
 * « (ancienne, à confirmer) » (libellé moteur, traduit dans la langue du
 * ticket) : l'agent ne doit pas la traiter comme une règle fraîche. Le titre et
 * le corps de la décision sont du contenu tiers : ils ne sont jamais traduits.
 */

import { sanitizeTicketContent } from '../../security';
import { isStaleDecision } from '../../util/dates';
import { decisionLabel, langOf, sectionTitle, t } from '../i18n';
import type { BriefLang } from '../labels';
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

/** Mention de fraîcheur d'une décision : vide si elle est récente. */
export function staleLabel(date: string, lang: BriefLang, now: Date = new Date()): string {
  return isStaleDecision(date, now) ? t('staleLabel', lang) : '';
}

export function decisionItems(
  decisions: DecisionRecord[],
  lang: BriefLang = 'fr'
): ReturnType<typeof sourcedItem>[] {
  return decisions.map((decision) => {
    const excerpt = decisionExcerpt(decision);
    const label = staleLabel(decision.date, lang);
    const text = excerpt
      ? `${decision.title.trim()} — ${excerpt}${label}`
      : `${decision.title.trim()}${label}`;
    return {
      ...sourcedItem(text, decisionLabel(decision.author, lang), decision.date),
      stale: Boolean(label),
    };
  });
}

export function buildDecisions(input: BriefInput): SectionSpec {
  const lang = langOf(input);
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: sectionTitle(NAME, lang),
    tool: 'get-related-decisions',
    kind: 'bullets',
    lang,
    items: decisionItems(input.decisions, lang),
  };
}
