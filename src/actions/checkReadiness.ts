/**
 * Outil `check-readiness` (GET) — le ticket est-il prêt à être confié à un
 * agent ?
 *
 * Le score stocké fait foi tant qu'il existe (il est recalculé à chaque
 * changement de ticket par le consumer d'événements) ; sinon il est calculé à
 * la volée puis enregistré. Chaque point perdu est expliqué : un score sans
 * « quoi corriger » ne sert à rien.
 */

import { collectDecisions, collectIssue } from '../collect/issueCollector';
import { computeReadiness } from '../readiness';
import { loadAttempts, loadReadiness, saveReadiness } from '../storage';
import { ReadinessScore } from '../types';
import { authorizeAndLog, isoNow, requireIssueKey, resolveSettings } from './readHelpers';
import { runAction } from './shared';

/** Collecte facultative : une source en panne ne doit pas empêcher de scorer. */
async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

/** Calcul complet : ticket, réglages projet, décisions et tentatives. */
export async function computeFresh(issueKey: string): Promise<ReadinessScore> {
  const issue = await collectIssue(issueKey);
  const settings = await resolveSettings(issue.projectKey);
  const [decisions, attempts] = await Promise.all([
    optional(() => collectDecisions(issue, settings), []),
    optional(() => loadAttempts(issueKey), []),
  ]);
  return computeReadiness(issue, settings, {
    decisions,
    comments: issue.comments,
    attempts,
  });
}

/** Calcule puis enregistre le score ; une écriture ratée ne bloque pas la réponse. */
export async function computeAndStore(issueKey: string): Promise<ReadinessScore> {
  const score = await computeFresh(issueKey);
  try {
    await saveReadiness(score, isoNow());
  } catch (error) {
    console.warn(`[action:check-readiness] score non enregistré : ${String(error)}`);
  }
  return score;
}

/** Forme de réponse de l'outil (contrat § 4.6). */
function toPayload(score: ReadinessScore): Record<string, unknown> {
  return {
    issueKey: score.issueKey,
    score: score.score,
    status: score.status,
    ready: score.ready,
    gaps: score.gaps,
    advice: score.advice,
  };
}

export async function checkReadiness(payload: any, context: any): Promise<any> {
  return runAction('check-readiness', async () => {
    const issueKey = requireIssueKey(payload);
    await authorizeAndLog(issueKey, 'check-readiness', context);
    const stored = await loadReadiness(issueKey);
    return toPayload(stored ?? (await computeAndStore(issueKey)));
  });
}
