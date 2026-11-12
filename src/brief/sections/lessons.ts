/**
 * Section 7 — Leçons.
 *
 * Leçons tirées des tentatives passées sur le même projet / composant. Elles
 * sont datées : une leçon vieille de deux ans ne vaut pas une leçon d'hier.
 * Le texte de la leçon est du contenu tiers : il n'est jamais traduit.
 */

import { sanitizeTicketContent } from '../../security';
import { langOf, lessonLabel, sectionTitle } from '../i18n';
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
  const lang = langOf(input);
  const items = sortedLessons(input.lessons).map((lesson) => {
    const text = sanitizeTicketContent(lesson.text, lesson.component, lesson.createdAt).trim();
    const component = lesson.component ? ` [${lesson.component}]` : '';
    return sourcedItem(`${text}${component}`, lessonLabel(lesson.id, lang), lesson.createdAt);
  });
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
