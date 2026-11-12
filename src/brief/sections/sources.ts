/**
 * Section 10 — Sources.
 *
 * Toutes les sources citées dans le brief, avec leur URL et leur date, pour
 * que l'agent (ou un humain) puisse remonter à l'original. Les libellés de
 * source sont produits par le moteur (donc traduits) ; les URL, titres et dates
 * sont des données.
 */

import {
  attemptLabel,
  changeLabel,
  decisionLabel,
  jiraLabel,
  langOf,
  lessonLabel,
  sectionTitle,
  settingsLabel,
} from '../i18n';
import type { BriefLang } from '../labels';
import { BriefInput, SourceRef } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Sources' as const;

/** Toutes les références citées, avant déduplication. */
function collectedRefs(input: BriefInput, lang: BriefLang): SourceRef[] {
  const { issue, settings, decisions, neighbors, lessons, attempts } = input;
  const refs: SourceRef[] = [
    { label: jiraLabel(issue.issueKey, lang), url: `/browse/${issue.issueKey}`, date: issue.updatedAt },
    {
      label: settingsLabel(settings.projectKey, lang),
      url: `/projects/${settings.projectKey}`,
      date: issue.updatedAt,
    },
  ];
  for (const decision of decisions) {
    refs.push({ label: decisionLabel(decision.author, lang), url: decision.url, date: decision.date });
  }
  for (const change of neighbors) {
    refs.push({ label: changeLabel(change.author, lang), url: change.url, date: change.date });
  }
  for (const lesson of lessons) {
    refs.push({
      label: lessonLabel(lesson.id, lang),
      url: `/browse/${issue.issueKey}`,
      date: lesson.createdAt,
    });
  }
  for (const attempt of attempts) {
    refs.push({
      label: attemptLabel(attempt.id, lang),
      url: `/browse/${issue.issueKey}`,
      date: attempt.startedAt,
    });
  }
  return refs;
}

function dedupeByUrl(refs: SourceRef[]): SourceRef[] {
  const seen = new Map<string, SourceRef>();
  for (const ref of refs) {
    if (!ref.url || seen.has(ref.url)) continue;
    seen.set(ref.url, ref);
  }
  return Array.from(seen.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Références dédupliquées (même URL = même source), datées. */
export function sourceRefs(input: BriefInput): SourceRef[] {
  return dedupeByUrl(collectedRefs(input, langOf(input)));
}

export function buildSources(input: BriefInput): SectionSpec {
  const lang = langOf(input);
  const items = sourceRefs(input).map((ref) => sourcedItem(ref.url, ref.label, ref.date));
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
