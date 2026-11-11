/**
 * Point d'entrée du moteur de brief (WP-brief).
 *
 * Les autres modules n'importent que depuis ici : le reste de `src/brief/` est
 * interne et peut évoluer sans casser les appelants.
 */

export { buildBrief, buildAllBudgets, collectAll, buildSpecs, briefHeader } from './builder';
export type { BriefDeps } from './builder';
export { applyBudget, budgetTarget, visibleItems, BUDGET_TOLERANCE, TRIM_ORDER } from './budget';
export type { BudgetResult } from './budget';
export {
  condenseItems,
  condenseText,
  dropUnsourced,
  passthroughCondenser,
} from './condenser';
export type { CondenseFn, CondenseInput } from './condenser';
export {
  hasSource,
  itemLine,
  rankOf,
  renderSection,
  renderSections,
  sourcedItem,
  sourcedOnly,
} from './sectionBuilder';
export type { RenderedSection, SectionKind, SectionSpec } from './sectionBuilder';
export type {
  AttemptRecord,
  BriefInput,
  DecisionRecord,
  IssueComment,
  IssueHistoryEntry,
  IssueLink,
  IssueSnapshot,
  LessonRecord,
  NeighborChange,
  ProjectSettings,
  SourceRef,
} from './inputs';

export { buildObjective, objectiveText } from './sections/objective';
export { buildAcceptanceCriteria, criteriaLines } from './sections/acceptanceCriteria';
export { buildDecisions, decisionItems, decisionExcerpt } from './sections/decisions';
export { buildAlreadyTried, attemptItems, failedAttempts } from './sections/alreadyTried';
export { buildNeighborChanges, sortedNeighbors } from './sections/neighborChanges';
export { buildConstraints } from './sections/constraints';
export { buildLessons, sortedLessons } from './sections/lessons';
export { buildWhoToAsk, contacts } from './sections/whoToAsk';
export { buildGaps, gapList } from './sections/gaps';
export { buildSources, sourceRefs } from './sections/sources';
