/**
 * Condensation du brief.
 *
 * La condensation est faite **par modèle** (injecté via `BriefDeps.condense`)
 * pour raccourcir les textes longs sans perdre le sens. En production, le
 * condenseur est branché sur le modèle hébergé (`src/llm/`, câblé par
 * `src/brief/defaults.ts`) ; sans modèle disponible, on retombe sur le texte
 * d'origine (`passthroughCondenser`).
 *
 * Trois garde-fous :
 *  - un élément conservé garde **son renvoi de source** (source + date), porté
 *    par l'élément et jamais réécrit par le modèle ;
 *  - un élément sans source est **supprimé** (BC-02), jamais « complété » ;
 *  - le texte a **déjà** été nettoyé par `sanitizeTicketContent` quand il
 *    arrive ici (collecte Jira/Confluence puis chaque section) : la
 *    condensation est le dernier maillon, elle re-vérifie sans jamais élargir
 *    (`boundInput` dans `src/llm/prompt.ts`).
 */

import { SourcedItem } from '../types';
import { estimateTokens, truncateToTokens } from '../util/tokens';
import { hasSource } from './sectionBuilder';

/** Entrée du condenseur (contrat § 4.2). */
export interface CondenseInput {
  text: string;
  budgetTokens: number;
  keepSources: boolean;
}

export type CondenseFn = (input: CondenseInput) => Promise<string>;

/** Repli sans modèle : le texte d'origine, tel quel. */
export const passthroughCondenser: CondenseFn = async (input) => input.text;

/** Supprime les éléments sans source : ils ne peuvent pas être cités. */
export function dropUnsourced(items: SourcedItem[]): SourcedItem[] {
  return items.filter(hasSource);
}

/**
 * Condense une liste d'items dans une enveloppe de jetons.
 * Retourne les items effectivement publiables (sourcés, non vides).
 */
export async function condenseItems(
  items: SourcedItem[],
  budgetTokens: number,
  condense: CondenseFn = passthroughCondenser
): Promise<SourcedItem[]> {
  const sourced = dropUnsourced(items);
  if (sourced.length === 0) return [];
  const perItem = Math.max(1, Math.floor(budgetTokens / sourced.length));
  const out: SourcedItem[] = [];
  for (const item of sourced) {
    const condensed = await condense({ text: item.text, budgetTokens: perItem, keepSources: true });
    const text = (condensed ?? '').trim();
    if (!text) continue;
    out.push({ ...item, text: truncateToTokens(text, perItem) });
  }
  return out;
}

/**
 * Condense le texte d'une section entière (objectif, par exemple) : une seule
 * enveloppe de jetons, source conservée à l'extérieur du texte condensé.
 */
export async function condenseText(
  text: string,
  budgetTokens: number,
  condense: CondenseFn = passthroughCondenser
): Promise<string> {
  const trimmed = text.trim();
  if (estimateTokens(trimmed) <= budgetTokens) return trimmed;
  const condensed = (await condense({ text: trimmed, budgetTokens, keepSources: true })).trim();
  const kept = condensed || trimmed;
  return truncateToTokens(kept, budgetTokens);
}
