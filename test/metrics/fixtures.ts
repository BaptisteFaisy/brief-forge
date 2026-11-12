/**
 * Fixtures des indicateurs de projet : des lignes SQL brutes, dans la forme
 * exacte des tables (colonnes `snake_case`), pour alimenter `FakeProjectSqlClient`.
 * Aucune valeur sensible, aucun réseau.
 */

import { SqlParam } from '../../src/storage/sqlClient';
import type { GapExplanation } from '../../src/types';

type Row = Record<string, SqlParam>;

export function reviewRow(overrides: Partial<{
  id: string;
  issue_key: string;
  attempt_id: string;
  reviewer_name: string;
  verdict: string;
  comment_md: string;
  created_at: string;
}> = {}): Row {
  return {
    id: 'review-1',
    issue_key: 'PAY-142',
    attempt_id: 'att-1',
    reviewer_name: 'Alice',
    verdict: 'confirmé',
    comment_md: '',
    created_at: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

export function attemptRow(overrides: Partial<{
  id: string;
  issue_key: string;
  report_md: string;
  started_at: string;
}> = {}): Row {
  return {
    id: 'att-1',
    issue_key: 'PAY-142',
    agent_name: 'rovo-agent',
    user_account_id: 'acc-1',
    started_at: '2026-11-09T10:00:00.000Z',
    status: 'terminé',
    report_md: '## Statut : terminé',
    criteria_covered: '1',
    tests_passed: '4/4',
    ...overrides,
  };
}

export function accessLogRow(overrides: Partial<{
  id: string;
  issue_key: string;
  tool: string;
  at: string;
}> = {}): Row {
  return {
    id: 'log-1',
    issue_key: 'PAY-142',
    tool: 'get-work-brief',
    user_account_id: 'acc-1',
    at: '2026-11-10T09:00:00.000Z',
    ...overrides,
  };
}

/** Brief stocké : seul `content_json.failedAttempts` compte pour l'indicateur 3. */
export function briefRow(
  issueKey: string,
  budget: string,
  failedAttempts: unknown[] = []
): Row {
  return {
    issue_key: issueKey,
    budget,
    content_md: `# Brief ${issueKey}`,
    content_json: JSON.stringify({ issueKey, budget, failedAttempts }),
    sources_json: '[]',
    built_at: '2026-11-10T09:00:00.000Z',
    stale: 0,
  };
}

export function readinessRow(issueKey: string, gaps: GapExplanation[]): Row {
  return {
    issue_key: issueKey,
    score: 55,
    ready: 0,
    status: 'à préciser',
    gaps_json: JSON.stringify(gaps),
    advice: 'Préciser le ticket.',
    computed_at: '2026-11-10T09:00:00.000Z',
  };
}

/** Écart de préparation : seul le libellé du critère est exploité. */
export function gap(criterion: string, pointsLost = 30): GapExplanation {
  return { criterion, pointsLost, reason: 'manque constaté' };
}
