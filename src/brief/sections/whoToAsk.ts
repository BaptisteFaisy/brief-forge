/**
 * Section 8 — À qui demander.
 *
 * Les personnes joignables sur ce ticket, avec la date du dernier signal les
 * concernant : rapporteur, assigné, et auteurs des commentaires (du plus récent
 * au plus ancien). L'agent sait ainsi qui relancer plutôt que de deviner.
 */

import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'À qui demander' as const;

interface Contact {
  name: string;
  role: string;
  date: string;
}

/** Contacts dédupliqués, le plus récent signal par personne. */
export function contacts(input: BriefInput): Contact[] {
  const { issue } = input;
  const byName = new Map<string, Contact>();
  const add = (name: string, role: string, date: string): void => {
    const clean = (name ?? '').trim();
    if (!clean || clean === 'inconnu') return;
    const known = byName.get(clean);
    if (known && new Date(known.date).getTime() >= new Date(date).getTime()) return;
    byName.set(clean, { name: clean, role, date });
  };
  add(issue.reporter, 'rapporteur', issue.createdAt);
  add(issue.assignee, 'assigné', issue.updatedAt);
  for (const comment of issue.comments) {
    add(comment.author, 'commentateur', comment.createdAt);
  }
  return Array.from(byName.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function buildWhoToAsk(input: BriefInput): SectionSpec {
  const items = contacts(input).map((contact) =>
    sourcedItem(`${contact.name} (${contact.role})`, `Jira ${input.issue.issueKey}`, contact.date)
  );
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-work-brief',
    kind: 'bullets',
    items,
    emptyNote: '_Aucun interlocuteur identifié : demander au chef de projet._',
  };
}
