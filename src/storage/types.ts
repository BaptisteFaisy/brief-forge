/**
 * Types de la couche de stockage (WP-storage).
 *
 * Les interfaces « Record » sont celles du contrat § 4.4 ; les interfaces
 * « Row » décrivent une ligne SQL brute (colonnes snake_case, booléens en
 * TINYINT 0/1) telle que la renvoie Forge SQL. La conversion est centralisée
 * dans `mappers.ts` : aucun repo ne manipule une ligne brute directement.
 */

import { Budget } from '../types';

/** Une tentative de résolution enregistrée pour un ticket. */
export interface AttemptRecord {
  id: string;
  issueKey: string;
  agentName: string;
  userAccountId: string;
  startedAt: string;
  status: string;
  reportMd: string;
  criteriaCovered: string;
  testsPassed: string;
}

/** Une leçon tirée d'une tentative, réutilisable sur un composant. */
export interface LessonRecord {
  id: string;
  projectKey: string;
  component: string;
  text: string;
  sourceAttemptId: string;
  createdAt: string;
}

/** Réservation de travail : un seul agent par ticket à la fois. */
export interface ClaimRecord {
  issueKey: string;
  agentName: string;
  userAccountId: string;
  expiresAt: string;
}

/** Brief persisté (un enregistrement par couple ticket × budget). */
export interface StoredBrief {
  issueKey: string;
  budget: Budget;
  contentMd: string;
  contentJson: string;
  sourcesJson: string;
  builtAt: string;
  stale: boolean;
}

/** Revue d'une tentative (QA humaine ou agent). */
export interface ReviewRecord {
  id: string;
  issueKey: string;
  attemptId: string;
  reviewerName: string;
  verdict: string;
  commentMd: string;
  createdAt: string;
}

/** Trace d'accès à un ticket via un outil MCP (BC-12). */
export interface AccessLogRecord {
  id: string;
  issueKey: string;
  tool: string;
  userAccountId: string;
  at: string;
}

/**
 * Réglages projet, sérialisés en JSON dans `project_settings`.
 * Réplique structurelle de `ProjectSettings` (contrat § 4.1, module collect) :
 * à remplacer par l'import `../collect/types` dès que WP-collect publie le
 * fichier, la forme étant strictement identique.
 */
export interface ProjectSettings {
  projectId: string;
  projectKey: string;
  acceptanceCriteriaField?: string;
  triggerStatus: string;
  triggerLabel?: string;
  constraintsText?: string;
  decisionLabels: string[];
  componentZone?: string;
}

/* ------------------------------------------------------------------ */
/* Lignes SQL brutes (colonnes snake_case, booléens en 0/1)            */
/* ------------------------------------------------------------------ */

export interface BriefRow {
  issue_key: string;
  budget: string;
  content_md: string;
  content_json: string;
  sources_json: string;
  built_at: string;
  stale: number;
}

export interface ReadinessRow {
  issue_key: string;
  score: number;
  ready: number;
  status: string;
  gaps_json: string;
  advice: string;
  computed_at: string;
}

export interface AttemptRow {
  id: string;
  issue_key: string;
  agent_name: string;
  user_account_id: string;
  started_at: string;
  status: string;
  report_md: string;
  criteria_covered: string;
  tests_passed: string;
}

export interface LessonRow {
  id: string;
  project_key: string;
  component: string;
  lesson_text: string;
  source_attempt_id: string;
  created_at: string;
}

export interface ClaimRow {
  issue_key: string;
  agent_name: string;
  user_account_id: string;
  expires_at: string;
}

export interface ReviewRow {
  id: string;
  issue_key: string;
  attempt_id: string;
  reviewer_name: string;
  verdict: string;
  comment_md: string;
  created_at: string;
}

export interface AccessLogRow {
  id: string;
  issue_key: string;
  tool: string;
  user_account_id: string;
  at: string;
}

export interface ProjectSettingsRow {
  project_key: string;
  settings_json: string;
  updated_at: string;
}
