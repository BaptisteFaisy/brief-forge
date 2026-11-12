/**
 * Libellés des manques de préparation, en français et en anglais.
 *
 * Le score de préparation stocke déjà le libellé **français** du critère
 * (`criterionLabel`, appliqué par le scorer) : on ne le recopie donc pas. On
 * dérive la liste des critères du barème (`READINESS_WEIGHTS`) et on n'ajoute
 * que la traduction anglaise, indexée par clé de critère.
 *
 * La correspondance passe par `normalizeText` (casse, accents et apostrophes
 * ignorés) : un libellé stocké avec une apostrophe droite reste reconnu.
 */

import { READINESS_WEIGHTS } from '../config';
import { criterionLabel, normalizeText } from '../readiness/support';

/** Critères pouvant apparaître dans un écart : le barème, plus l'objectif. */
const CRITERION_KEYS: string[] = [...Object.keys(READINESS_WEIGHTS), 'objective'];

/** Traduction anglaise des critères (le français vient de `criterionLabel`). */
const EN_LABELS: Record<string, string> = {
  acceptanceCriteria: 'Verifiable acceptance criteria',
  boundedScope: 'Bounded scope',
  noBlockingLink: 'No open blocking link',
  noContradictoryDecision: 'No contradictory decision',
  reachableAuthor: 'Reachable author',
  noUnansweredQuestion: 'No unanswered question',
  componentIdentified: 'Identified component',
  objective: 'Written objective',
};

/** Libellé normalisé → clé de critère. */
const KEY_BY_LABEL: Map<string, string> = new Map(
  CRITERION_KEYS.map((key) => [normalizeText(criterionLabel(key)), key])
);

/** Libellé anglais d'un manque ; le libellé stocké si le critère est inconnu. */
export function labelEnFor(criterion: string): string {
  const key = KEY_BY_LABEL.get(normalizeText(criterion ?? ''));
  if (!key) return criterion;
  return EN_LABELS[key] ?? criterion;
}
