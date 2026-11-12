/**
 * Section 7 — Leçons.
 *
 * Leçons tirées des tentatives passées sur le même projet / composant. Elles
 * sont datées : une leçon vieille de deux ans ne vaut pas une leçon d'hier.
 * Le texte de la leçon est du contenu tiers : il n'est jamais traduit.
 */

import { sanitizeTicketContent } from '../../security';
import { langOf, lessonLabel, sectionTitle, t } from '../i18n';
import { BriefInput, BriefLesson } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';

const NAME = 'Leçons' as const;

/** Leçons du projet, les plus récentes d'abord. */
export function sortedLessons(lessons: BriefLesson[]): BriefLesson[] {
  return lessons
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function buildLessons(input: BriefInput): SectionSpec {
  const lang = langOf(input);
  const items = sortedLessons(input.lessons).map((lesson) => {
    const text = sanitizeTicketContent(lesson.text, lesson.component, lesson.createdAt).trim();
    const component = lesson.component ? ` [${lesson.component}]` : '';
    // Même motif que les décisions : une leçon ancienne reste affichée, mais
    // elle est marquée « à confirmer » plutôt que présentée comme acquise.
    const stale = lesson.stale ? t('staleLabel', lang) : '';
    return {
      ...sourcedItem(`${text}${component}${stale}`, lessonLabel(lesson.id, lang), lesson.createdAt),
      stale: Boolean(lesson.stale),
    };
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
