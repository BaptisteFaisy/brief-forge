/**
 * Boucle d'apprentissage : une correction humaine devient une leçon (BC-14).
 *
 * Une leçon est « une correction humaine apportée à un compte rendu,
 * réinjectée dans les briefs suivants de la même zone » (cahier des charges § 7).
 *
 * Règle de création d'une leçon (unique, testée) :
 *  1. le verdict est `corrigé` ;
 *  2. la note est **exploitable** : non vide, au moins `MIN_LESSON_CHARS`
 *     caractères et au moins un caractère alphanumérique — une correction sans
 *     note ne produit jamais de leçon vide ;
 *  3. il n'existe pas encore de leçon pour ce compte rendu (projet + tentative) :
 *     corriger deux fois la même tentative ne duplique pas la leçon.
 *
 * Sinon la revue est enregistrée seule et le résultat dit pourquoi.
 */

import { STALE_DECISION_MONTHS } from '../config';
import { safeLimit } from '../storage/accessLogRepo';
import { loadAttempt, loadProjectLessons, saveLesson, saveReview } from '../storage';
import { newId, projectKeyFromIssueKey } from '../storage/helpers';
import type { AttemptRecord, LessonRecord, ReviewRecord } from '../storage/types';
import { ageInMonths, isLessonStale } from './age';
import { appliesToComponent, componentFromAttempt, projectZone } from './zone';
import type {
  LessonForBrief,
  LessonProvenance,
  LessonSkipReason,
  LessonsForIssueOptions,
  RecordReviewInput,
  RecordReviewResult,
  ReviewVerdict,
} from './types';

/** Longueur minimale d'une note pour qu'elle devienne une leçon. */
export const MIN_LESSON_CHARS = 12;

/** Nombre maximal de leçons renvoyées par défaut (la section 7 tranche ensuite). */
export const DEFAULT_LESSON_LIMIT = 20;

/** Plafond dur du nombre de leçons renvoyées. */
const MAX_LESSON_LIMIT = 100;

/** Normalise un verdict : casse et accents ignorés (`Corrige` → `corrigé`). */
export function normalizeVerdict(raw: string): ReviewVerdict {
  const plain = (raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (plain.startsWith('corrige') || plain === 'correction') return 'corrigé';
  return 'confirmé';
}

/** Vrai si la note peut devenir une leçon (texte présent et signifiant). */
export function isUsableNote(note: string): boolean {
  const clean = (note ?? '').trim();
  if (clean.length < MIN_LESSON_CHARS) return false;
  return /[\p{L}\p{N}]/u.test(clean);
}

/** Texte de la leçon : la correction, précédée du ticket qui l'a produite. */
export function lessonText(issueKey: string, note: string): string {
  const clean = (note ?? '').trim();
  return issueKey ? `${issueKey} — ${clean}` : clean;
}

/** Raison d'un saut de leçon, d'après la note fournie. */
function skipReasonForNote(note: string): LessonSkipReason {
  return (note ?? '').trim().length === 0 ? 'note-vide' : 'note-trop-courte';
}

/** Composant retenu : explicite, puis compte rendu, puis zone du projet. */
async function resolveComponent(
  input: RecordReviewInput,
  attempt: AttemptRecord | null,
  projectKey: string
): Promise<string> {
  const explicit = (input.component ?? '').trim();
  if (explicit) return explicit;
  const fromReport = componentFromAttempt(attempt);
  if (fromReport) return fromReport;
  return projectZone(projectKey);
}

/** Leçon déjà enregistrée pour ce compte rendu (idempotence). */
async function findExistingLesson(
  projectKey: string,
  attemptId: string
): Promise<LessonRecord | null> {
  if (!attemptId) return null;
  const lessons = await loadProjectLessons(projectKey);
  return lessons.find((lesson) => lesson.sourceAttemptId === attemptId) ?? null;
}

/** Résultat intermédiaire de la création de leçon. */
interface LessonOutcome {
  lesson: LessonRecord | null;
  created: boolean;
  reason: LessonSkipReason | null;
}

/** Crée la leçon d'une correction, ou explique pourquoi elle n'est pas créée. */
async function upsertLesson(params: {
  projectKey: string;
  component: string;
  attemptId: string;
  issueKey: string;
  note: string;
  now: Date;
}): Promise<LessonOutcome> {
  const { projectKey, component, attemptId, issueKey, note, now } = params;
  if (!isUsableNote(note)) {
    return { lesson: null, created: false, reason: skipReasonForNote(note) };
  }
  if (!projectKey) {
    return { lesson: null, created: false, reason: 'projet-inconnu' };
  }
  const existing = await findExistingLesson(projectKey, attemptId);
  if (existing) {
    return { lesson: existing, created: false, reason: 'leçon-déjà-existante' };
  }
  const lesson: LessonRecord = {
    id: newId(),
    projectKey,
    component,
    text: lessonText(issueKey, note),
    sourceAttemptId: attemptId,
    createdAt: now.toISOString(),
  };
  await saveLesson(lesson);
  return { lesson, created: true, reason: null };
}

/** Revue à enregistrer : l'identifiant et l'horodatage sont générés ici. */
function buildReview(params: {
  attemptId: string;
  issueKey: string;
  reviewerName: string;
  verdict: ReviewVerdict;
  note: string;
  now: Date;
}): ReviewRecord {
  return {
    id: newId(),
    issueKey: params.issueKey,
    attemptId: params.attemptId,
    reviewerName: (params.reviewerName ?? '').trim() || 'inconnu',
    verdict: params.verdict,
    commentMd: params.note,
    createdAt: params.now.toISOString(),
  };
}

/** Résultat de revue : la revue, la zone retenue, et ce qu'elle a produit. */
function reviewResult(params: {
  review: ReviewRecord;
  projectKey: string;
  component: string;
  lesson: LessonRecord | null;
  created: boolean;
  reason: LessonSkipReason | null;
}): RecordReviewResult {
  return {
    review: params.review,
    projectKey: params.projectKey,
    component: params.component,
    lesson: params.lesson,
    lessonCreated: params.created,
    lessonSkippedReason: params.reason,
  };
}

/**
 * Enregistre la revue d'un compte rendu et, si la correction est exploitable,
 * la leçon qui en découle (rattachée au projet et à la zone du ticket).
 */
export async function recordReview(input: RecordReviewInput): Promise<RecordReviewResult> {
  const now = input.now ?? new Date();
  const attempt = await loadAttempt(input.attemptId);
  const issueKey = (attempt?.issueKey ?? input.issueKey ?? '').trim();
  const projectKey = projectKeyFromIssueKey(issueKey);
  const verdict = normalizeVerdict(input.verdict);
  const note = (input.note ?? '').trim();
  const component = await resolveComponent(input, attempt, projectKey);

  const review = buildReview({
    attemptId: input.attemptId,
    issueKey,
    reviewerName: input.reviewerName,
    verdict,
    note,
    now,
  });
  await saveReview(review);

  if (verdict !== 'corrigé') {
    return reviewResult({
      review,
      projectKey,
      component,
      lesson: null,
      created: false,
      reason: 'verdict-confirmé',
    });
  }

  const outcome = await upsertLesson({
    projectKey,
    component,
    attemptId: input.attemptId,
    issueKey,
    note,
    now,
  });
  return reviewResult({
    review,
    projectKey,
    component,
    lesson: outcome.lesson,
    created: outcome.created,
    reason: outcome.reason,
  });
}

/** Tentatives d'origine des leçons, indexées par identifiant. */
async function loadProvenance(lessons: LessonRecord[]): Promise<Map<string, LessonProvenance>> {
  const ids = [...new Set(lessons.map((lesson) => lesson.sourceAttemptId).filter(Boolean))];
  const attempts = await Promise.all(ids.map((id) => loadAttempt(id)));
  const provenance = new Map<string, LessonProvenance>();
  for (const attempt of attempts) {
    if (!attempt) continue;
    provenance.set(attempt.id, {
      attemptId: attempt.id,
      issueKey: attempt.issueKey,
      agentName: attempt.agentName,
      startedAt: attempt.startedAt,
    });
  }
  return provenance;
}

/**
 * Leçons à réinjecter dans la section 7 du brief d'un ticket : même projet et
 * même composant/zone, plus les leçons de projet (sans composant), de la plus
 * récente à la plus ancienne. Une leçon trop ancienne est **renvoyée** avec
 * `stale: true` : c'est la section du brief qui décide de l'affichage.
 */
export async function lessonsForIssue(
  issueKey: string,
  options: LessonsForIssueOptions = {}
): Promise<LessonForBrief[]> {
  const now = options.now ?? new Date();
  const maxAgeMonths = options.maxAgeMonths ?? STALE_DECISION_MONTHS;
  const projectKey = projectKeyFromIssueKey(issueKey);
  const component = (options.component ?? '').trim() || (await projectZone(projectKey));
  const limit = safeLimit(options.limit ?? DEFAULT_LESSON_LIMIT, DEFAULT_LESSON_LIMIT, MAX_LESSON_LIMIT);

  const lessons = await loadProjectLessons(projectKey);
  const selected = lessons
    .filter((lesson) => appliesToComponent(lesson.component, component))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

  const provenance = await loadProvenance(selected);
  return selected.map((lesson) => ({
    ...lesson,
    stale: isLessonStale(lesson.createdAt, now, maxAgeMonths),
    ageMonths: ageInMonths(lesson.createdAt, now),
    source: provenance.get(lesson.sourceAttemptId) ?? null,
  }));
}
