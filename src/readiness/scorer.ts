/**
 * Score de préparation — orchestration et décision (contrat § 4.3).
 *
 * Le score est la somme des sept critères du barème (`READINESS_WEIGHTS`).
 * Règle non négociable : **aucun point perdu n'est muet**. Chaque critère en
 * échec produit une entrée `gaps[]` avec son libellé, ses points perdus et une
 * raison en clair ; la somme des points perdus plus le score vaut toujours 100.
 *
 * Plancher d'objectif : une description absente ou squelettique rend le travail
 * non évaluable, quel que soit le reste. Le score est alors plafonné juste
 * sous le seuil « à préciser », et le plafonnement lui-même est expliqué dans
 * `gaps[]` — un ticket sans objectif n'est jamais « prêt ».
 */

import { READINESS_THRESHOLDS, READINESS_WEIGHTS } from '../config';
import type { GapExplanation, ReadinessScore } from '../types';
import { checkAcceptanceCriteria } from './criteria/acceptanceCriteriaCheck';
import { checkBlockingLink } from './criteria/blockingLinkCheck';
import { checkComponentIdentified } from './criteria/componentIdentifiedCheck';
import { checkContradictoryDecision } from './criteria/contradictoryDecisionCheck';
import { checkReachableAuthor } from './criteria/reachableAuthorCheck';
import { checkScopeBounded } from './criteria/scopeBoundedCheck';
import { checkUnansweredQuestion } from './criteria/unansweredQuestionCheck';
import { buildAdvice, countWords, criterionLabel, MIN_DESCRIPTION_WORDS, statusFor } from './support';
import type {
  CriterionCheck,
  CriterionInput,
  CriterionOutcome,
  IssueSnapshot,
  ProjectSettings,
  ReadinessExtras,
} from './types';

/** Les sept critères du barème, dans l'ordre de lecture du produit. */
export const CRITERIA_CHECKS: CriterionCheck[] = [
  checkAcceptanceCriteria,
  checkScopeBounded,
  checkBlockingLink,
  checkContradictoryDecision,
  checkReachableAuthor,
  checkUnansweredQuestion,
  checkComponentIdentified,
];

/** Somme du barème : 100. Dérivée de `config.ts`, jamais recopiée. */
const MAX_SCORE = Object.values(READINESS_WEIGHTS).reduce((total, points) => total + points, 0);

/** Plafond d'un ticket sans objectif : juste sous « à préciser ». */
const FLOOR_SCORE = READINESS_THRESHOLDS.needsPrecision - 1;

function buildInput(
  issue: IssueSnapshot,
  settings: ProjectSettings,
  extras: ReadinessExtras
): CriterionInput {
  return {
    issue,
    settings,
    decisions: extras.decisions ?? [],
    comments: extras.comments ?? issue.comments ?? [],
    attempts: extras.attempts ?? [],
  };
}

function toGap(outcome: CriterionOutcome): GapExplanation {
  return {
    criterion: criterionLabel(outcome.criterion),
    pointsLost: outcome.maxPoints - outcome.points,
    reason: outcome.reason ?? '',
  };
}

/**
 * Plafonnement d'un ticket sans objectif écrit. Retourne le manque à gagner
 * à expliquer, ou `null` si le plafond ne mord pas.
 */
function objectiveFloorGap(issue: IssueSnapshot, rawScore: number): GapExplanation | null {
  if (countWords(issue.description) >= MIN_DESCRIPTION_WORDS) return null;
  const overflow = rawScore - FLOOR_SCORE;
  if (overflow <= 0) return null;
  return {
    criterion: criterionLabel('objective'),
    pointsLost: overflow,
    reason:
      'description absente ou squelettique : sans objectif écrit, aucun travail n’est ' +
      `évaluable ; le score est plafonné à ${FLOOR_SCORE} tant que la description n’est pas rédigée.`,
  };
}

/**
 * Calcule le score de préparation d'un ticket.
 *
 * @param issue instantané du ticket (collecte)
 * @param settings réglages du projet
 * @param extras décisions, commentaires et tentatives déjà chargés
 */
export function computeReadiness(
  issue: IssueSnapshot,
  settings: ProjectSettings,
  extras: ReadinessExtras = {}
): ReadinessScore {
  const input = buildInput(issue, settings, extras);
  const outcomes = CRITERIA_CHECKS.map((check) => check(input));
  const rawScore = outcomes.reduce((total, outcome) => total + outcome.points, 0);
  const floorGap = objectiveFloorGap(issue, rawScore);
  const score = floorGap ? FLOOR_SCORE : Math.min(rawScore, MAX_SCORE);
  const status = statusFor(score);

  const gaps = outcomes
    .filter((outcome) => !outcome.passed)
    .map(toGap)
    .concat(floorGap ? [floorGap] : [])
    .sort((a, b) => b.pointsLost - a.pointsLost);

  return {
    issueKey: issue.issueKey,
    score,
    ready: status === 'prêt',
    status,
    gaps,
    advice: buildAdvice(status, outcomes, input.attempts.length),
  };
}
