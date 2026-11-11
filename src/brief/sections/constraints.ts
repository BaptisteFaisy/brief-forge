/**
 * Section 6 — Contraintes.
 *
 * Contraintes déclarées par le projet (réglages) et contraintes déduites du
 * ticket : composant / zone technique, étiquettes, type de ticket. Tout est
 * sourcé et daté, rien n'est inventé.
 */

import { sanitizeTicketContent } from '../../security';
import { SourcedItem } from '../../types';
import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Contraintes' as const;

export function buildConstraints(input: BriefInput): SectionSpec {
  const { issue, settings } = input;
  const items: SourcedItem[] = [];
  const declared = sanitizeTicketContent(
    settings.constraintsText ?? '',
    settings.projectKey,
    issue.updatedAt
  ).trim();
  if (declared) {
    items.push(sourcedItem(declared, `Réglages ${settings.projectKey}`, issue.updatedAt));
  }
  const zone = settings.componentZone ?? issue.components.join(', ');
  if (zone) {
    items.push(sourcedItem(`Zone technique : ${zone}`, `Jira ${issue.issueKey}`, issue.updatedAt));
  }
  if (issue.labels.length > 0) {
    items.push(
      sourcedItem(`Étiquettes : ${issue.labels.join(', ')}`, `Jira ${issue.issueKey}`, issue.updatedAt)
    );
  }
  items.push(
    sourcedItem(
      `Type de ticket : ${issue.issueType} — statut ${issue.status}`,
      `Jira ${issue.issueKey}`,
      issue.updatedAt
    )
  );
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-work-brief',
    kind: 'bullets',
    items,
    emptyNote: '_Aucune contrainte déclarée pour ce projet._',
  };
}
