/**
 * Outil `get-related-decisions` (GET) — les décisions Confluence rattachées au
 * ticket, la plus récente d'abord.
 *
 * Une décision de plus de 18 mois est signalée `stale: true` : l'agent doit la
 * confirmer avant de la traiter comme une règle (utilitaire `isStaleDecision`).
 */

import { collectDecisions, collectIssue } from '../collect/issueCollector';
import type { DecisionRecord } from '../collect/types';
import { sanitizeTicketContent } from '../security';
import { isStaleDecision } from '../util/dates';
import { authorizeAndLog, requireIssueKey, resolveSettings, sortDescByDate } from './readHelpers';
import { runAction } from './shared';

/** Une décision telle que renvoyée à l'agent appelant. */
export interface DecisionEntry {
  title: string;
  date: string;
  author: string;
  url: string;
  stale: boolean;
}

/** Le titre est du contenu tiers : masqué et nettoyé avant publication. */
function toEntry(decision: DecisionRecord): DecisionEntry {
  return {
    title: sanitizeTicketContent(decision.title, decision.author, decision.date).trim(),
    date: decision.date,
    author: decision.author,
    url: decision.url,
    stale: isStaleDecision(decision.date),
  };
}

export async function getRelatedDecisions(payload: any, context: any): Promise<any> {
  return runAction('get-related-decisions', async () => {
    const issueKey = requireIssueKey(payload);
    await authorizeAndLog(issueKey, 'get-related-decisions', context);

    const issue = await collectIssue(issueKey);
    const settings = await resolveSettings(issue.projectKey);
    const records = await collectDecisions(issue, settings);
    const decisions = sortDescByDate(records, (decision) => decision.date).map(toEntry);
    return { issueKey, decisions };
  });
}
