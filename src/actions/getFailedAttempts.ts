/**
 * Outil `get-failed-attempts` (GET) — ce qui a déjà été tenté sur le ticket et
 * pourquoi ça n'a pas marché (BC-07), la tentative la plus récente d'abord.
 *
 * La sélection (une tentative « échouée » = statut ≠ terminé) et l'ordre
 * viennent de `failedAttempts`, la même règle que la section « Déjà tenté » du
 * brief : un seul comportement pour l'outil et pour le brief.
 */

import { failedAttempts } from '../brief';
import { loadAttempts } from '../storage';
import type { AttemptRecord } from '../storage';
import { authorizeAndLog, requireIssueKey, splitAttemptReport } from './readHelpers';
import { runAction } from './shared';

/** Une tentative échouée telle que renvoyée à l'agent appelant. */
export interface FailedAttemptEntry {
  date: string;
  agentName: string;
  status: string;
  summary: string;
  reason: string;
}

function toEntry(attempt: AttemptRecord): FailedAttemptEntry {
  const { summary, reason } = splitAttemptReport(
    attempt.reportMd,
    attempt.agentName,
    attempt.startedAt
  );
  return {
    date: attempt.startedAt,
    agentName: attempt.agentName,
    status: attempt.status,
    summary,
    reason,
  };
}

export async function getFailedAttempts(payload: any, context: any): Promise<any> {
  return runAction('get-failed-attempts', async () => {
    const issueKey = requireIssueKey(payload);
    await authorizeAndLog(issueKey, 'get-failed-attempts', context);
    const attempts = await loadAttempts(issueKey);
    return { issueKey, attempts: failedAttempts(attempts).map(toEntry) };
  });
}
