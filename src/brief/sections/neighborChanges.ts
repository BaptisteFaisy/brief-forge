/**
 * Section 5 — Changements voisins.
 *
 * Pull requests et commits proches du ticket (même zone / même composant) :
 * ils disent à l'agent ce qui a bougé récemment dans le code qu'il s'apprête
 * à toucher. Les titres et URL sont du contenu tiers : jamais traduits.
 */

import { sanitizeTicketContent } from '../../security';
import { changeLabel, langOf, sectionTitle } from '../i18n';
import { BriefInput, NeighborChange } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Changements voisins' as const;

function changeText(change: NeighborChange): string {
  const title = sanitizeTicketContent(change.title, change.author, change.date).trim();
  const state = change.state ? ` [${change.state}]` : '';
  const kind = change.kind === 'pull-request' ? 'PR' : 'commit';
  return `${kind} ${title}${state} — ${change.url}`;
}

/** Les changements les plus récents d'abord. */
export function sortedNeighbors(changes: NeighborChange[]): NeighborChange[] {
  return changes
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function buildNeighborChanges(input: BriefInput): SectionSpec {
  const lang = langOf(input);
  const items = sortedNeighbors(input.neighbors).map((change) =>
    sourcedItem(changeText(change), changeLabel(change.author, lang), change.date)
  );
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: sectionTitle(NAME, lang),
    tool: 'get-neighbor-changes',
    kind: 'bullets',
    lang,
    items,
  };
}
