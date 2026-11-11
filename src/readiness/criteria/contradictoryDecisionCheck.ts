/**
 * Critère « aucune décision applicable contradictoire » — 10 points.
 *
 * Deux décisions qui portent sur le même sujet et dont l'une interdit ce que
 * l'autre impose mettent l'agent dans une impasse : il en appliquera une au
 * hasard. On ne pénalise pas une décision **remplacée** explicitement (c'est
 * une évolution normale), seulement une contradiction non tranchée.
 */

import { buildOutcome, normalizeText, quoteExcerpt, significantWords } from '../support';
import type { CriterionInput, CriterionOutcome, DecisionRecord } from '../types';

const NEGATION = /(ne pas|jamais|interdit|abandonn|supprim|retir|ne plus|obsolet|deprecat|desactiv|ne doit pas)/;
const AFFIRMATION = /(toujours|obligatoire|doit|utilis|conserv|gard|impos|requis|recommande|activer)/;
const SUPERSESSION = /(remplace|remplacee|annule|obsolet|deprecat|supersede|a la place de|invalide)/;
const MIN_SHARED_WORDS = 2;

/** Vrai si une des deux décisions dit explicitement qu'elle remplace l'autre. */
function isSuperseded(a: DecisionRecord, b: DecisionRecord): boolean {
  const newer = a.date >= b.date ? a : b;
  return SUPERSESSION.test(normalizeText(newer.body));
}

function contradicts(a: DecisionRecord, b: DecisionRecord): boolean {
  const bodyA = normalizeText(`${a.title} ${a.body}`);
  const bodyB = normalizeText(`${b.title} ${b.body}`);
  const opposed =
    (NEGATION.test(bodyA) && AFFIRMATION.test(bodyB)) ||
    (NEGATION.test(bodyB) && AFFIRMATION.test(bodyA));
  if (!opposed) return false;
  const shared = sharedTopic(a, b);
  return shared.length >= MIN_SHARED_WORDS && !isSuperseded(a, b);
}

function sharedTopic(a: DecisionRecord, b: DecisionRecord): string[] {
  const wordsA = new Set(significantWords(`${a.title} ${a.body}`));
  const wordsB = new Set(significantWords(`${b.title} ${b.body}`));
  return Array.from(wordsA).filter((word) => wordsB.has(word));
}

/** Première paire contradictoire trouvée, avec son sujet commun. */
function findContradiction(
  decisions: DecisionRecord[]
): { a: DecisionRecord; b: DecisionRecord; topic: string[] } | null {
  for (let i = 0; i < decisions.length; i += 1) {
    for (let j = i + 1; j < decisions.length; j += 1) {
      if (contradicts(decisions[i], decisions[j])) {
        return { a: decisions[i], b: decisions[j], topic: sharedTopic(decisions[i], decisions[j]) };
      }
    }
  }
  return null;
}

export function checkContradictoryDecision(input: CriterionInput): CriterionOutcome {
  const decisions = input.decisions ?? [];
  if (decisions.length < 2) {
    return buildOutcome('noContradictoryDecision', true);
  }

  const found = findContradiction(decisions);
  if (!found) {
    return buildOutcome('noContradictoryDecision', true);
  }

  const topic = found.topic.slice(0, 4).join(', ');
  return buildOutcome(
    'noContradictoryDecision',
    false,
    `« ${quoteExcerpt(found.a.title, 40)} » (${found.a.date}) et « ${quoteExcerpt(
      found.b.title,
      40
    )} » (${found.b.date}) se contredisent sur ${topic} : trancher et consigner la décision retenue.`
  );
}
