/**
 * Les quatre indicateurs de projet (cahier des charges § 18).
 *
 * Tout est calculé sur les **vraies tables** (`review`, `attempt`, `access_log`,
 * `brief`, `readiness`) : aucune donnée simulée, aucun `MOCK_*`. Chaque
 * indicateur renvoie son dénominateur et un drapeau « données insuffisantes » ;
 * sous le seuil d'échantillon, `percent` vaut `null` plutôt qu'un nombre inventé.
 */

import { normalizeText } from '../readiness/support';
import { safeLimit } from '../storage/accessLogRepo';
import { fromJson } from '../storage/helpers';
import type { ReviewRecord, StoredBrief } from '../storage/types';
import { declaresAssumptions } from './assumptions';
import { labelEnFor } from './gapLabels';
import {
  loadProjectAccessLog,
  loadProjectAttempts,
  loadProjectBriefs,
  loadProjectReadiness,
  loadProjectReviews,
} from './queries';
import type {
  CountMetric,
  GapFrequency,
  GapMetric,
  ProjectMetrics,
  RateMetric,
  UiProjectMetrics,
} from './types';

/** Seuil d'échantillon sous lequel un taux n'est pas publié. */
export const MIN_SAMPLE_SIZE = 5;

/** Outil dont la trace compte comme « clarification demandée ». */
export const CLARIFICATION_TOOL = 'ask-clarification';

/** Nombre de manques affichés par défaut. */
export const DEFAULT_TOP_GAPS_LIMIT = 5;

/** Plafond du nombre de manques affichés. */
const MAX_TOP_GAPS_LIMIT = 20;

/** Options communes aux indicateurs. */
export interface MetricOptions {
  /** Taille minimale d'échantillon pour publier un taux. */
  minSample?: number;
}

/** Pourcentage arrondi, ou `null` si l'échantillon est trop petit. */
function percentOf(numerator: number, denominator: number, minSample: number): number | null {
  if (denominator < minSample || denominator === 0) return null;
  return Math.round((100 * numerator) / denominator);
}

/** Vrai si la revue est une correction (casse et accents ignorés). */
function isCorrection(review: ReviewRecord): boolean {
  return normalizeText(review.verdict ?? '').startsWith('corrige');
}

/**
 * Une revue par compte rendu : un compte rendu confirmé puis corrigé compte
 * comme **corrigé** (c'est la dernière revue qui fait foi).
 */
export function lastReviewPerAttempt(reviews: ReviewRecord[]): ReviewRecord[] {
  const byAttempt = new Map<string, ReviewRecord>();
  for (const review of reviews) {
    const key = review.attemptId || review.id;
    const current = byAttempt.get(key);
    if (!current || Date.parse(review.createdAt) >= Date.parse(current.createdAt)) {
      byAttempt.set(key, review);
    }
  }
  return [...byAttempt.values()];
}

/**
 * Indicateur 1 — part des comptes rendus **confirmés sans correction**.
 *
 * Dénominateur : comptes rendus du projet ayant reçu au moins une revue.
 * Numérateur : ceux dont la dernière revue est une confirmation.
 */
export async function confirmedWithoutCorrectionRate(
  projectKey: string,
  options: MetricOptions = {}
): Promise<RateMetric> {
  const minSample = options.minSample ?? MIN_SAMPLE_SIZE;
  const reviews = await loadProjectReviews(projectKey);
  const perAttempt = lastReviewPerAttempt(reviews);
  const corrected = perAttempt.filter(isCorrection).length;
  const numerator = perAttempt.length - corrected;
  const denominator = perAttempt.length;
  return {
    kind: 'rate',
    numerator,
    denominator,
    percent: percentOf(numerator, denominator, minSample),
    insufficientData: denominator < minSample,
    description:
      'Part des comptes rendus relus qui ont été confirmés sans correction ' +
      '(une revue par compte rendu, la dernière l’emportant).',
  };
}

/**
 * Indicateur 2 — clarifications **demandées** plutôt que devinées.
 *
 * Numérateur : appels à l'outil `ask-clarification` tracés dans `access_log`
 * (rétention 90 jours). Dénominateur : ces appels **plus** les comptes rendus
 * qui déclarent au moins une hypothèse (section « Hypothèses prises »).
 */
export async function clarificationsAskedVsGuessed(
  projectKey: string,
  options: MetricOptions = {}
): Promise<RateMetric> {
  const minSample = options.minSample ?? MIN_SAMPLE_SIZE;
  const [accessLog, attempts] = await Promise.all([
    loadProjectAccessLog(projectKey),
    loadProjectAttempts(projectKey),
  ]);
  const asked = accessLog.filter((entry) => entry.tool === CLARIFICATION_TOOL).length;
  const guessed = attempts.filter((attempt) => declaresAssumptions(attempt.reportMd)).length;
  const denominator = asked + guessed;
  return {
    kind: 'rate',
    numerator: asked,
    denominator,
    percent: percentOf(asked, denominator, minSample),
    insufficientData: denominator < minSample,
    description:
      'Part des points d’incertitude traités par une question posée (outil `ask-clarification`) ' +
      'plutôt que par une hypothèse prise dans un compte rendu.',
  };
}

/** Vrai si le brief stocké avait une section « Déjà tenté » non vide. */
function hasAlreadyTried(brief: StoredBrief): boolean {
  const parsed = fromJson<{ failedAttempts?: unknown[] }>(brief.contentJson, {});
  return Array.isArray(parsed.failedAttempts) && parsed.failedAttempts.length > 0;
}

/**
 * Indicateur 3 — tentatives répétées évitées.
 *
 * Source retenue : les **briefs stockés** (`brief.content_json`), seuls à dire
 * ce que l'agent a réellement reçu — `access_log` trace l'appel à
 * `get-work-brief` mais pas le contenu de la section. On compte les **tickets
 * distincts** dont au moins un brief servi avait une section « Déjà tenté »
 * non vide (un ticket servi dans les trois budgets ne compte qu'une fois).
 * Dénominateur : tickets du projet ayant au moins un brief stocké.
 */
export async function repeatedAttemptsAvoided(projectKey: string): Promise<CountMetric> {
  const briefs = await loadProjectBriefs(projectKey);
  const served = new Set<string>();
  const warned = new Set<string>();
  for (const brief of briefs) {
    served.add(brief.issueKey);
    if (hasAlreadyTried(brief)) warned.add(brief.issueKey);
  }
  return {
    kind: 'count',
    count: warned.size,
    denominator: served.size,
    insufficientData: served.size === 0,
    description:
      'Tickets dont le brief servi avait une section « Déjà tenté » non vide : ' +
      'l’agent repart des tentatives précédentes au lieu de les rejouer.',
  };
}

/**
 * Indicateur 4 — manques les plus fréquents du projet.
 *
 * Source : les écarts (`gaps`) des derniers scores de préparation stockés.
 * Dénominateur : tickets du projet ayant un score enregistré.
 */
export async function topGaps(
  projectKey: string,
  limit: number = DEFAULT_TOP_GAPS_LIMIT
): Promise<GapMetric> {
  const scores = await loadProjectReadiness(projectKey);
  const counts = new Map<string, number>();
  for (const score of scores) {
    for (const gap of score.gaps ?? []) {
      const label = (gap.criterion ?? '').trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const gaps: GapFrequency[] = [...counts.entries()]
    .map(([labelFr, count]) => ({ labelFr, labelEn: labelEnFor(labelFr), count }))
    .sort((a, b) => b.count - a.count || a.labelFr.localeCompare(b.labelFr))
    .slice(0, safeLimit(limit, DEFAULT_TOP_GAPS_LIMIT, MAX_TOP_GAPS_LIMIT));
  return {
    kind: 'gaps',
    gaps,
    denominator: scores.length,
    insufficientData: scores.length === 0,
    description: 'Manques les plus fréquents relevés par le score de préparation des tickets du projet.',
  };
}

/** Les quatre indicateurs d'un projet, calculés en parallèle. */
export async function projectMetrics(
  projectKey: string,
  options: MetricOptions = {}
): Promise<ProjectMetrics> {
  const [confirmed, clarifications, repeated, gaps] = await Promise.all([
    confirmedWithoutCorrectionRate(projectKey, options),
    clarificationsAskedVsGuessed(projectKey, options),
    repeatedAttemptsAvoided(projectKey),
    topGaps(projectKey),
  ]);
  return {
    confirmedWithoutCorrection: confirmed,
    clarificationsAskedVsGuessed: clarifications,
    repeatedAttemptsAvoided: repeated,
    topGaps: gaps,
  };
}

/**
 * Projection vers la forme attendue par l'écran projet (`UIProjectMetrics`).
 *
 * Un indicateur sans données suffisantes vaut `0` ici : l'écran doit alors
 * afficher « données insuffisantes » en s'appuyant sur `insufficientData`
 * (disponible dans `ProjectMetrics`), et non un pourcentage inventé.
 */
export function toUiProjectMetrics(metrics: ProjectMetrics): UiProjectMetrics {
  return {
    confirmedWithoutCorrectionRate: metrics.confirmedWithoutCorrection.percent,
    clarificationsAskedVsGuessedRate: metrics.clarificationsAskedVsGuessed.percent,
    repeatedAttemptsAvoidedCount: metrics.repeatedAttemptsAvoided.count,
    topGaps: metrics.topGaps.gaps.map((gap) => ({
      labelFr: gap.labelFr,
      labelEn: gap.labelEn,
      count: gap.count,
    })),
  };
}
