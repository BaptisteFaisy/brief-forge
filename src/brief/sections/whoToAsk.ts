/**
 * Section 8 — À qui demander.
 *
 * Les personnes joignables sur ce ticket, avec la date du dernier signal les
 * concernant : rapporteur, assigné, et auteurs des commentaires **citables**
 * (visibilité restreinte exclue, `citableComments`), du plus récent au plus
 * ancien. L'agent sait ainsi qui relancer plutôt que de deviner. Les noms sont
 * des données ; le rôle affiché est un libellé moteur, traduit.
 */

import { citableComments } from '../../collect/visibility';
import { jiraLabel, langOf, sectionTitle, t } from '../i18n';
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
  const lang = langOf(input);
  const byName = new Map<string, Contact>();
  const add = (name: string, roleKey: 'roleReporter' | 'roleAssignee' | 'roleCommenter', date: string): void => {
    const clean = (name ?? '').trim();
    if (!clean || clean === 'inconnu') return;
    const known = byName.get(clean);
    if (known && new Date(known.date).getTime() >= new Date(date).getTime()) return;
    byName.set(clean, { name: clean, role: t(roleKey, lang), date });
  };
  add(issue.reporter, 'roleReporter', issue.createdAt);
  add(issue.assignee, 'roleAssignee', issue.updatedAt);
  for (const comment of citableComments(issue.comments)) {
    add(comment.author, 'roleCommenter', comment.createdAt);
  }
  return Array.from(byName.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function buildWhoToAsk(input: BriefInput): SectionSpec {
  const lang = langOf(input);
  const source = jiraLabel(input.issue.issueKey, lang);
  const items = contacts(input).map((contact) =>
    sourcedItem(`${contact.name} (${contact.role})`, source, contact.date)
  );
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: sectionTitle(NAME, lang),
    tool: 'get-work-brief',
    kind: 'bullets',
    lang,
    items,
  };
}
