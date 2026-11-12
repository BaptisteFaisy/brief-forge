/**
 * Module « boucle d'apprentissage » (lot D).
 *
 * Deux portes d'entrée :
 *  - `recordReview` : enregistre la revue d'un compte rendu **et** transforme
 *    une correction en leçon réutilisable (BC-14) ;
 *  - `lessonsForIssue` : les leçons à réinjecter dans la section 7 du brief
 *    d'un ticket, avec leur provenance et leur marqueur « ancienne ».
 */

export {
  DEFAULT_LESSON_LIMIT,
  MIN_LESSON_CHARS,
  isUsableNote,
  lessonText,
  lessonsForIssue,
  normalizeVerdict,
  recordReview,
} from './reviewService';

export {
  DEFAULT_LESSON_MAX_AGE_MONTHS,
  ageInMonths,
  isLessonStale,
  monthsBetween,
} from './age';

export {
  appliesToComponent,
  componentFromAttempt,
  projectZone,
  sameComponent,
} from './zone';

export type {
  LessonForBrief,
  LessonProvenance,
  LessonSkipReason,
  LessonsForIssueOptions,
  RecordReviewInput,
  RecordReviewResult,
  ReviewVerdict,
} from './types';
