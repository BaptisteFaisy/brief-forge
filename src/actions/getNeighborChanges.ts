/**
 * Outil `get-neighbor-changes` (GET) — pull requests et commits proches du
 * ticket (même composant, tickets liés), les plus récents d'abord.
 *
 * Ils disent à l'agent ce qui vient de bouger dans le code qu'il s'apprête à
 * toucher. L'ordre est celui du brief (`sortedNeighbors`), pour que les deux
 * surfaces racontent la même histoire.
 */

import { sortedNeighbors } from '../brief';
import { collectIssue, collectNeighborChanges } from '../collect/issueCollector';
import type { NeighborChange } from '../collect/types';
import { sanitizeTicketContent } from '../security';
import { authorizeAndLog, requireIssueKey } from './readHelpers';
import { runAction } from './shared';

/** Un changement voisin tel que renvoyé à l'agent appelant. */
export interface NeighborChangeEntry {
  kind: NeighborChange['kind'];
  title: string;
  url: string;
  date: string;
  author: string;
  state: string;
}

/** Le titre vient d'un système tiers : masqué et nettoyé avant publication. */
function toEntry(change: NeighborChange): NeighborChangeEntry {
  return {
    kind: change.kind,
    title: sanitizeTicketContent(change.title, change.author, change.date).trim(),
    url: change.url,
    date: change.date,
    author: change.author,
    state: change.state ?? '',
  };
}

export async function getNeighborChanges(payload: any, context: any): Promise<any> {
  return runAction('get-neighbor-changes', async () => {
    const issueKey = requireIssueKey(payload);
    await authorizeAndLog(issueKey, 'get-neighbor-changes', context);

    const issue = await collectIssue(issueKey);
    const changes = await collectNeighborChanges(issue);
    return { issueKey, changes: sortedNeighbors(changes).map(toEntry) };
  });
}
