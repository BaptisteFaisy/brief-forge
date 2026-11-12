/**
 * Condenseur branché sur le modèle hébergé (WP-llm → WP-brief).
 *
 * C'est l'adaptateur entre `CondenseFn` (contrat § 4.2, la seule interface vue
 * par le moteur de brief) et le client LLM. Trois garde-fous, dans l'ordre :
 *
 * 1. **Entrée bornée** — le texte est nettoyé (`sanitizeTicketContent`, déjà
 *    appliqué en amont par la collecte et par les sections : la condensation
 *    est le dernier maillon) puis tronqué à `MAX_INPUT_TOKENS` avant l'envoi ;
 * 2. **Temps borné** — un budget de session (`budgetMs`) couvre l'ensemble des
 *    appels d'une construction de brief : au-delà, on rend le texte d'origine
 *    sans appeler le modèle (une action MCP dispose de 55 s, le consumer vise
 *    moins de 2 min pour les trois budgets) ;
 * 3. **Sortie rattachable** — ce que le modèle rend non rattachable au texte
 *    fourni (réponse vide, lignes de seule attribution, contenu sans mot
 *    commun avec l'entrée) est **jeté** : `''` remonte, le moteur supprime
 *    l'élément concerné et ne le repêche jamais sous une autre source.
 *
 * Un échec d'appel (modèle absent, erreur, timeout) rend en revanche le
 * **texte d'origine** : perdre du contenu serait pire que ne pas le raccourcir.
 */

import type { CondenseFn, CondenseInput } from '../brief/condenser';
import { significantWords } from '../readiness/support';
import { defaultLlmClient } from './client';
import { MAX_INPUT_TOKENS, condenseSystemPrompt, condenseUserPrompt, outputTokensFor } from './prompt';
import type { LlmClient } from './types';

/** Budget de temps d'une session de condensation (une construction de brief). */
export const DEFAULT_SESSION_BUDGET_MS = 20_000;

export interface ModelCondenserOptions {
  /** Client injecté (tests) ; à défaut, le client branché sur `@forge/llm`. */
  client?: LlmClient;
  budgetMs?: number;
  maxInputTokens?: number;
  now?: () => number;
}

/** Ligne qui n'apporte qu'une attribution de source, sans contenu. */
const SOURCE_ONLY_LINE = /^\s*_?\s*(source|sources|référence|références|reference|references)\s*[:—-]/i;

/** Préambule de politesse du modèle, sans valeur informative. */
const PREAMBLE_LINE = /^\s*(voici|ci-dessous|here(\s+is|\u2019s)|summary|résumé)\b.{0,60}[:.]?\s*$/i;

/** Clôtures Markdown que le modèle ajoute parfois malgré la consigne. */
const FENCE_LINE = /^\s*(```|~~~)/;

/** Lignes conservables d'une réponse : ni clôture, ni préambule, ni source seule. */
export function cleanModelAnswer(answer: string): string[] {
  return (answer ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !FENCE_LINE.test(line))
    .filter((line) => !SOURCE_ONLY_LINE.test(line))
    .filter((line) => !PREAMBLE_LINE.test(line));
}

/**
 * Rattachement à la source : la sortie doit partager au moins un mot porteur
 * avec l'entrée. Une réponse hors sujet n'est rattachable à aucune source.
 */
export function isGrounded(answer: string, source: string): boolean {
  const fromSource = new Set(significantWords(source));
  if (fromSource.size === 0) return false;
  return significantWords(answer).some((word) => fromSource.has(word));
}

/** Réponse exploitable, ou `''` si rien n'est rattachable (élément jeté). */
export function keepAttributable(answer: string, source: string): string {
  const lines = cleanModelAnswer(answer);
  if (lines.length === 0) return '';
  const kept = lines.join('\n');
  return isGrounded(kept, source) ? kept : '';
}

/** Fabrique le `condense` de production : une session = un budget de temps. */
export function createModelCondenser(options: ModelCondenserOptions = {}): CondenseFn {
  const client = options.client ?? defaultLlmClient();
  const budgetMs = options.budgetMs ?? DEFAULT_SESSION_BUDGET_MS;
  const maxInputTokens = options.maxInputTokens ?? MAX_INPUT_TOKENS;
  const now = options.now ?? ((): number => Date.now());
  const startedAt = now();
  const system = condenseSystemPrompt();
  let budgetWarned = false;

  return async (input: CondenseInput): Promise<string> => {
    if (now() - startedAt >= budgetMs) {
      if (!budgetWarned) {
        budgetWarned = true;
        console.warn(`[llm] budget de condensation épuisé (${budgetMs} ms) : texte d'origine conservé.`);
      }
      return input.text;
    }
    const user = condenseUserPrompt(input.text, input.budgetTokens, maxInputTokens);
    const answer = await client.complete(system, user, outputTokensFor(input.budgetTokens));
    if (answer === null) return input.text;
    return keepAttributable(answer, input.text);
  };
}
