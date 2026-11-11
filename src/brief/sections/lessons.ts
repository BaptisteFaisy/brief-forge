/**
 * Section 7 — Leçons.
 *
 * Leçons tirées des tentatives passées sur le même projet / composant. Elles
 * sont datées : une leçon vieille de deux ans ne vaut pas une leçon d'hier.
 */

import { sanitizeTicketContent } from '../../security';
import { BriefInput, LessonRecord } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Leçons' as const;

/** Leçons du projet, les plus récentes d'abord. */
export function sortedLessons(lessons: LessonRecord[]): LessonRecord[] {
  return lessons
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function buildLessons(input: BriefInput): SectionSpec {
  const items = sortedLessons(input.lessons).map((lesson) => {
    const text = sanitizeTicketContent(lesson.text, lesson.component, lesson.createdAt).trim();
    const component = lesson.component ? ` [${lesson.component}]` : '';
    return sourcedItem(`${text}${component}`, `Leçon ${lesson.id}`, lesson.createdAt);
  });
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'get-work-brief',
    kind: 'bullets',
    items,
    emptyNote: '_Aucune leçon enregistrée pour ce projet._',
  };
}
