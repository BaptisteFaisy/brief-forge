/**
 * Conversions ligne SQL ↔ objets métier.
 *
 * Une seule implémentation par table : les repos lisent/écrivent des objets
 * typés et délèguent ici le nommage des colonnes et les conversions
 * (booléens TINYINT, JSON des colonnes `*_json`).
 */

import { Budget, GapExplanation, ReadinessScore } from '../types';
import {
  AccessLogRecord,
  AttemptRecord,
  AttemptRow,
  AccessLogRow,
  BriefRow,
  ClaimRecord,
  ClaimRow,
  LessonRecord,
  LessonRow,
  ProjectSettings,
  ProjectSettingsRow,
  ReadinessRow,
  ReviewRecord,
  ReviewRow,
  StoredBrief,
} from './types';
import { fromDbBool, fromJson, toDbBool, toJson } from './helpers';

/** Colonnes de `brief`, dans l'ordre d'insertion. */
export const BRIEF_COLUMNS = [
  'issue_key',
  'budget',
  'content_md',
  'content_json',
  'sources_json',
  'built_at',
  'stale',
] as const;

export function briefToParams(brief: StoredBrief): Array<string | number> {
  return [
    brief.issueKey,
    brief.budget,
    brief.contentMd,
    brief.contentJson,
    brief.sourcesJson,
    brief.builtAt,
    toDbBool(brief.stale),
  ];
}

export function rowToBrief(row: BriefRow): StoredBrief {
  return {
    issueKey: row.issue_key,
    budget: row.budget as Budget,
    contentMd: row.content_md,
    contentJson: row.content_json,
    sourcesJson: row.sources_json,
    builtAt: row.built_at,
    stale: fromDbBool(row.stale),
  };
}

/** Colonnes de `readiness`, dans l'ordre d'insertion. */
export const READINESS_COLUMNS = [
  'issue_key',
  'score',
  'ready',
  'status',
  'gaps_json',
  'advice',
  'computed_at',
] as const;

export function readinessToParams(score: ReadinessScore, computedAt: string): Array<string | number> {
  return [
    score.issueKey,
    score.score,
    toDbBool(score.ready),
    score.status,
    toJson(score.gaps),
    score.advice,
    computedAt,
  ];
}

export function rowToReadiness(row: ReadinessRow): ReadinessScore {
  return {
    issueKey: row.issue_key,
    score: Number(row.score),
    ready: fromDbBool(row.ready),
    status: row.status as ReadinessScore['status'],
    gaps: fromJson<GapExplanation[]>(row.gaps_json, []),
    advice: row.advice,
  };
}

/** Colonnes de `attempt`, dans l'ordre d'insertion. */
export const ATTEMPT_COLUMNS = [
  'id',
  'issue_key',
  'agent_name',
  'user_account_id',
  'started_at',
  'status',
  'report_md',
  'criteria_covered',
  'tests_passed',
] as const;

export function attemptToParams(attempt: AttemptRecord): string[] {
  return [
    attempt.id,
    attempt.issueKey,
    attempt.agentName,
    attempt.userAccountId,
    attempt.startedAt,
    attempt.status,
    attempt.reportMd,
    attempt.criteriaCovered,
    attempt.testsPassed,
  ];
}

export function rowToAttempt(row: AttemptRow): AttemptRecord {
  return {
    id: row.id,
    issueKey: row.issue_key,
    agentName: row.agent_name,
    userAccountId: row.user_account_id,
    startedAt: row.started_at,
    status: row.status,
    reportMd: row.report_md,
    criteriaCovered: row.criteria_covered,
    testsPassed: row.tests_passed,
  };
}

/** Colonnes de `lesson`, dans l'ordre d'insertion. */
export const LESSON_COLUMNS = [
  'id',
  'project_key',
  'component',
  'lesson_text',
  'source_attempt_id',
  'created_at',
] as const;

export function lessonToParams(lesson: LessonRecord): string[] {
  return [
    lesson.id,
    lesson.projectKey,
    lesson.component,
    lesson.text,
    lesson.sourceAttemptId,
    lesson.createdAt,
  ];
}

export function rowToLesson(row: LessonRow): LessonRecord {
  return {
    id: row.id,
    projectKey: row.project_key,
    component: row.component,
    text: row.lesson_text,
    sourceAttemptId: row.source_attempt_id,
    createdAt: row.created_at,
  };
}

/** Colonnes de `claim`, dans l'ordre d'insertion. */
export const CLAIM_COLUMNS = [
  'issue_key',
  'agent_name',
  'user_account_id',
  'expires_at',
] as const;

export function claimToParams(claim: ClaimRecord): string[] {
  return [claim.issueKey, claim.agentName, claim.userAccountId, claim.expiresAt];
}

export function rowToClaim(row: ClaimRow): ClaimRecord {
  return {
    issueKey: row.issue_key,
    agentName: row.agent_name,
    userAccountId: row.user_account_id,
    expiresAt: row.expires_at,
  };
}

/** Colonnes de `review`, dans l'ordre d'insertion. */
export const REVIEW_COLUMNS = [
  'id',
  'issue_key',
  'attempt_id',
  'reviewer_name',
  'verdict',
  'comment_md',
  'created_at',
] as const;

export function reviewToParams(review: ReviewRecord): string[] {
  return [
    review.id,
    review.issueKey,
    review.attemptId,
    review.reviewerName,
    review.verdict,
    review.commentMd,
    review.createdAt,
  ];
}

export function rowToReview(row: ReviewRow): ReviewRecord {
  return {
    id: row.id,
    issueKey: row.issue_key,
    attemptId: row.attempt_id,
    reviewerName: row.reviewer_name,
    verdict: row.verdict,
    commentMd: row.comment_md,
    createdAt: row.created_at,
  };
}

/** Colonnes de `access_log`, dans l'ordre d'insertion. */
export const ACCESS_LOG_COLUMNS = [
  'id',
  'issue_key',
  'tool',
  'user_account_id',
  'at',
] as const;

export function accessLogToParams(entry: AccessLogRecord): string[] {
  return [entry.id, entry.issueKey, entry.tool, entry.userAccountId, entry.at];
}

export function rowToAccessLog(row: AccessLogRow): AccessLogRecord {
  return {
    id: row.id,
    issueKey: row.issue_key,
    tool: row.tool,
    userAccountId: row.user_account_id,
    at: row.at,
  };
}

/** Colonnes de `project_settings`, dans l'ordre d'insertion. */
export const PROJECT_SETTINGS_COLUMNS = ['project_key', 'settings_json', 'updated_at'] as const;

export function projectSettingsToParams(settings: ProjectSettings, updatedAt: string): string[] {
  return [settings.projectKey, toJson(settings), updatedAt];
}

/** Renvoie `null` si le JSON est illisible : réglages à ressaisir. */
export function rowToProjectSettings(row: ProjectSettingsRow): ProjectSettings | null {
  const parsed = fromJson<ProjectSettings | null>(row.settings_json, null);
  if (!parsed || typeof parsed !== 'object' || !parsed.projectKey) return null;
  return parsed;
}
