/**
 * Point d'entrée du module « score de préparation » (WP-readiness).
 *
 * Seul `computeReadiness` est utilisé par les autres modules (action
 * `check-readiness`, consumer, UI) : c'est la signature du contrat § 4.3. Les
 * critères sont exportés séparément pour être testés un par un.
 */

export { computeReadiness, CRITERIA_CHECKS } from './scorer';

export { checkAcceptanceCriteria } from './criteria/acceptanceCriteriaCheck';
export { checkScopeBounded } from './criteria/scopeBoundedCheck';
export { checkBlockingLink } from './criteria/blockingLinkCheck';
export { checkContradictoryDecision } from './criteria/contradictoryDecisionCheck';
export { checkReachableAuthor } from './criteria/reachableAuthorCheck';
export { checkUnansweredQuestion } from './criteria/unansweredQuestionCheck';
export { checkComponentIdentified } from './criteria/componentIdentifiedCheck';

export { buildAdvice, buildOutcome, criterionLabel, remediationFor, statusFor } from './support';

export type {
  AttemptRecord,
  CriterionCheck,
  CriterionInput,
  CriterionKey,
  CriterionOutcome,
  DecisionRecord,
  IssueComment,
  IssueHistoryEntry,
  IssueLink,
  IssueSnapshot,
  ProjectSettings,
  ReadinessExtras,
} from './types';
