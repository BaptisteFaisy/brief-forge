/**
 * Section 10 — Sources.
 *
 * Toutes les sources citées dans le brief, avec leur URL et leur date, pour
 * que l'agent (ou un humain) puisse remonter à l'original.
 */

import { BriefInput, SourceRef } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Sources' as const;

/** Références dédupliquées (même URL = même source), datées. */
export function sourceRefs(input: BriefInput): SourceRef[] {
  const { issue, settings, decisions, neighbors, lessons, attempts } = input;
  const refs: SourceRef[] = [
    { label: `Jira ${issue.issueKey}`, url: `/browse/${issue.issueKey}`, date: issue.updatedAt },
    { label: `Réglages ${settings.projectKey}`, url: `/projects/${settings.projectKey}`, date: issue.updatedAt },
  ];
  for (const decision of decisions) {
    refs.push({ label: `Décision ${decision.author}`, url: decision.url, date: decision.date });
  }
  for (const change of neighbors) {
    refs.push({ label: `Changement ${change.author}`, url: change.url, date: change.date });
  }
  for (const lesson of lessons) {
    refs.push({ label: `Leçon ${lesson.id}`, url: `/browse/${issue.issueKey}`, date: lesson.createdAt });
  }
  for (const attempt of attempts) {
    refs.push({ label: `Tentative ${attempt.id}`, url: `/browse/${issue.issueKey}`, date: attempt.startedAt });
  }
  return dedupeByUrl(refs);
}

function dedupeByUrl(refs: SourceRef[]): SourceRef[] {
  const seen = new Map<string, SourceRef>();
  for (const ref of refs) {
    if (!ref.url || seen.has(ref.url)) continue;
    seen.set(ref.url, ref);
  }
  return Array.from(seen.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function buildSources(input: BriefInput): SectionSpec {
  const items = sourceRefs(input).map((ref) =>
    sourcedItem(`${ref.label} — ${ref.url}`, 'Référence', ref.date)
  );
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-work-brief',
    kind: 'bullets',
    items,
    emptyNote: '_Aucune source externe : tout vient du ticket._',
  };
}
