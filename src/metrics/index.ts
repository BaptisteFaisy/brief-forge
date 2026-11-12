/**
 * Module « indicateurs de projet » (lot D, cahier des charges § 18).
 *
 * Quatre indicateurs calculés sur les vraies tables, plus la projection vers la
 * forme attendue par l'écran projet. Aucun indicateur n'invente de valeur :
 * sous le seuil d'échantillon, `percent` vaut `null` et `insufficientData` est
 * vrai.
 */

export {
  CLARIFICATION_TOOL,
  DEFAULT_TOP_GAPS_LIMIT,
  MIN_SAMPLE_SIZE,
  clarificationsAskedVsGuessed,
  confirmedWithoutCorrectionRate,
  lastReviewPerAttempt,
  projectMetrics,
  repeatedAttemptsAvoided,
  toUiProjectMetrics,
  topGaps,
} from './projectMetrics';
export type { MetricOptions } from './projectMetrics';

export { assumptionsFromReport, declaresAssumptions } from './assumptions';
export { labelEnFor } from './gapLabels';
export {
  loadProjectAccessLog,
  loadProjectAttempts,
  loadProjectBriefs,
  loadProjectReadiness,
  loadProjectReviews,
  projectLikePattern,
} from './queries';

export type {
  CountMetric,
  GapFrequency,
  GapMetric,
  MetricBase,
  ProjectMetrics,
  RateMetric,
  UiProjectMetrics,
} from './types';
