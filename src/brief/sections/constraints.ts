/**
 * Section 6 — Contraintes.
 *
 * Contraintes déclarées par le projet (réglages) et contraintes déduites du
 * ticket : composant / zone technique, étiquettes, type de ticket. Tout est
 * sourcé et daté, rien n'est inventé. Les valeurs (nom de composant,
 * étiquette, statut) sont des données : seuls les préfixes sont des libellés.
 */

import { sanitizeTicketContent } from '../../security';
import { SourcedItem } from '../../types';
import { jiraLabel, langOf, sectionTitle, settingsLabel, tf } from '../i18n';
import type { BriefLang } from '../labels';
import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Contraintes' as const;

/** Contraintes déduites du ticket : zone technique, étiquettes, type/statut. */
function deducedConstraints(input: BriefInput, lang: BriefLang): SourcedItem[] {
  const { issue, settings } = input;
  const source = jiraLabel(issue.issueKey, lang);
  const items: SourcedItem[] = [];
  const zone = settings.componentZone ?? issue.components.join(', ');
  if (zone) {
    items.push(sourcedItem(tf('technicalZone', lang, { zone }), source, issue.updatedAt));
  }
  if (issue.labels.length > 0) {
    items.push(
      sourcedItem(tf('issueLabels', lang, { labels: issue.labels.join(', ') }), source, issue.updatedAt)
    );
  }
  items.push(
    sourcedItem(
      tf('issueTypeLine', lang, { type: issue.issueType, status: issue.status }),
      source,
      issue.updatedAt
    )
  );
  return items;
}

export function buildConstraints(input: BriefInput): SectionSpec {
  const { issue, settings } = input;
  const lang = langOf(input);
  const items: SourcedItem[] = [];
  const declared = sanitizeTicketContent(
    settings.constraintsText ?? '',
    settings.projectKey,
    issue.updatedAt
  ).trim();
  if (declared) {
    items.push(sourcedItem(declared, settingsLabel(settings.projectKey, lang), issue.updatedAt));
  }
  items.push(...deducedConstraints(input, lang));
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
