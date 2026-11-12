/**
 * Langue du brief (lot langue).
 *
 * Le brief est rendu **dans la langue du ticket** : le moteur détecte
 * français / anglais à partir du résumé et de la description, puis traduit tous
 * ses **propres** libellés (titres de section, mentions de vide, trous,
 * en-tête, avertissement, libellés de source). Le contenu tiers cité — résumé,
 * description, décisions, commentaires, comptes rendus — n'est **jamais**
 * traduit : il est recopié tel quel après nettoyage de sécurité.
 *
 * Détection volontairement simple et testable, sans dépendance externe :
 * diacritiques français + mots-outils non ambigus des deux langues. Un texte
 * sans signal (ticket vide, jargon pur) retombe sur le français, langue du
 * produit et rendu historique : les fixtures d'intégration restent stables.
 */

import type { SectionName } from '../config';
import { BRIEF_DATA_DISCLAIMER, truncationHint } from '../util/markdown';
import type { BriefInput } from './inputs';
import {
  BRIEF_STRINGS,
  DISCLAIMER_EN,
  SECTION_EMPTY_NOTES,
  SECTION_TITLES,
  TRUNCATION_EN,
} from './labels';
import type { BriefLang, BriefStringKey } from './labels';

export type { BriefLang, BriefStringKey } from './labels';
export { BRIEF_STRINGS, SECTION_EMPTY_NOTES, SECTION_TITLES } from './labels';

/* ------------------------------------------------------------------ *
 * Détection de langue
 * ------------------------------------------------------------------ */

/** Diacritiques proprement français : signal fort, même sur un texte court. */
const FRENCH_DIACRITICS = /[àâäçéèêëîïôöùûüœæ]/g;

/** Poids d'une diacritique : une seule suffit à trancher un texte court. */
const DIACRITIC_WEIGHT = 2;

/** Longueur minimale d'un mot-outil pris en compte. */
const MIN_MARKER_LENGTH = 3;

const WORD_SEPARATOR = /[^\p{L}]+/u;

/**
 * Mots-outils français **non ambigus** : aucun n'est aussi un mot anglais
 * courant (« client », « rapport », « tentative », « support » sont exclus).
 */
const FRENCH_MARKERS = new Set([
  'les', 'des', 'une', 'est', 'sont', 'était', 'été', 'être', 'avoir', 'dans', 'pour',
  'avec', 'cette', 'ces', 'leur', 'leurs', 'mais', 'donc', 'comme', 'quand', 'après',
  'avant', 'pendant', 'chaque', 'aucun', 'aucune', 'autre', 'autres', 'même', 'sans',
  'sous', 'entre', 'depuis', 'vers', 'chez', 'ainsi', 'alors', 'puis', 'enfin', 'pas',
  'tout', 'tous', 'toute', 'très', 'bien', 'aussi', 'encore', 'déjà', 'fait', 'faut',
  'doit', 'peut', 'sera', 'pourquoi', 'faire', 'dire', 'voir', 'savoir', 'pouvoir',
  'vouloir', 'devoir', 'venir', 'aller', 'prendre', 'mettre', 'donner', 'trouver',
  'besoin', 'problème', 'résumé', 'règle', 'règles', 'contrainte', 'contraintes',
  'critère', 'critères', 'décision', 'décisions', 'leçon', 'leçons', 'trou', 'trous',
  'résultat', 'résultats', 'équipe', 'projet', 'serveur', 'commande', 'commandes',
  'fichier', 'colonne', 'valeur', 'qualité', 'sécurité', 'exemple', 'étape', 'étapes',
  'réponse', 'réponses', 'utilisateur', 'comportement', 'données', 'liste', 'ligne',
  'lignes', 'bloc', 'blocs', 'extrait', 'urgence', 'priorité', 'métrique', 'schéma',
  'calcul', 'ajouter', 'corrigé', 'affiché', 'renvoyé', 'appliqué', 'création',
  'navigateur', 'mémoire', 'côté', 'garantie',
]);

/** Mots-outils anglais **non ambigus** : aucun n'est aussi un mot français. */
const ENGLISH_MARKERS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'these', 'those', 'not', 'should',
  'must', 'will', 'can', 'was', 'were', 'has', 'have', 'had', 'from', 'they', 'them',
  'their', 'there', 'when', 'what', 'which', 'who', 'how', 'why', 'where', 'after',
  'before', 'through', 'during', 'without', 'within', 'under', 'again', 'once', 'only',
  'other', 'some', 'such', 'same', 'also', 'just', 'very', 'need', 'using', 'used',
  'make', 'made', 'take', 'get', 'add', 'expected', 'customer', 'users', 'teams',
  'working', 'please', 'ensure', 'database', 'endpoint', 'request', 'response',
  'error', 'failure', 'failed', 'success', 'links', 'login', 'logout', 'upload',
  'download', 'install', 'upgrade', 'browser', 'column', 'columns', 'file', 'files',
  'value', 'values', 'filter', 'filters', 'order', 'orders', 'first', 'last', 'next',
  'back', 'new', 'old', 'time', 'line', 'lines',
]);

/** Scores bruts des deux langues sur un texte (diacritiques comprises). */
export function languageScore(text: string): { fr: number; en: number } {
  const source = (text ?? '').toLowerCase();
  const diacritics = (source.match(FRENCH_DIACRITICS) ?? []).length;
  let fr = 0;
  let en = 0;
  for (const word of source.split(WORD_SEPARATOR)) {
    if (word.length < MIN_MARKER_LENGTH) continue;
    if (FRENCH_MARKERS.has(word)) fr += 1;
    if (ENGLISH_MARKERS.has(word)) en += 1;
  }
  return { fr: fr + diacritics * DIACRITIC_WEIGHT, en };
}

/** Langue d'un texte : anglais seulement si le signal anglais l'emporte. */
export function detectLanguage(text: string): BriefLang {
  const score = languageScore(text);
  return score.en > score.fr ? 'en' : 'fr';
}

/** Langue d'un ticket : résumé **et** description (jamais le contenu cité). */
export function detectIssueLanguage(issue: {
  summary?: string;
  description?: string;
} | null): BriefLang {
  return detectLanguage(`${issue?.summary ?? ''}\n${issue?.description ?? ''}`);
}

/** Langue effective d'un contexte de brief : français si non déterminée. */
export function langOf(input?: Pick<BriefInput, 'lang'> | null): BriefLang {
  return input?.lang === 'en' ? 'en' : 'fr';
}

/* ------------------------------------------------------------------ *
 * Libellés
 * ------------------------------------------------------------------ */

function interpolate(template: string, vars: Record<string, string | number>): string {
  return Object.keys(vars).reduce(
    (acc, name) => acc.split(`{${name}}`).join(String(vars[name])),
    template
  );
}

/** Libellé brut d'une clé, dans la langue demandée. */
export function t(key: BriefStringKey, lang: BriefLang): string {
  return lang === 'en' ? BRIEF_STRINGS[key].en : BRIEF_STRINGS[key].fr;
}

/** Libellé interpolé : les `{variable}` du gabarit sont remplacées. */
export function tf(
  key: BriefStringKey,
  lang: BriefLang,
  vars: Record<string, string | number>
): string {
  return interpolate(t(key, lang), vars);
}

/* ------------------------------------------------------------------ *
 * Libellés de source (une seule fabrique, partagée par les sections)
 * ------------------------------------------------------------------ */

export function jiraLabel(issueKey: string, lang: BriefLang): string {
  return tf('sourceJira', lang, { key: issueKey });
}

export function settingsLabel(projectKey: string, lang: BriefLang): string {
  return tf('sourceSettings', lang, { project: projectKey });
}

export function decisionLabel(author: string, lang: BriefLang): string {
  return tf('sourceDecision', lang, { author });
}

export function changeLabel(author: string, lang: BriefLang): string {
  return tf('sourceChange', lang, { author });
}

export function lessonLabel(lessonId: string, lang: BriefLang): string {
  return tf('sourceLesson', lang, { id: lessonId });
}

export function attemptLabel(attemptId: string, lang: BriefLang): string {
  return tf('sourceAttempt', lang, { id: attemptId });
}

/** Titre affiché d'une section (la clé interne reste le nom français). */
export function sectionTitle(name: SectionName, lang: BriefLang): string {
  const entry = SECTION_TITLES[name];
  return entry ? (lang === 'en' ? entry.en : entry.fr) : name;
}

/** Mention de section vide (BC-03 : le trou est dit, jamais deviné). */
export function sectionEmptyNote(name: SectionName, lang: BriefLang): string {
  const entry = SECTION_EMPTY_NOTES[name];
  return entry ? (lang === 'en' ? entry.en : entry.fr) : t('emptySection', lang);
}

/** Avertissement d'en-tête : les blocs cités sont des données. */
export function disclaimerFor(lang: BriefLang): string {
  return lang === 'en' ? DISCLAIMER_EN : BRIEF_DATA_DISCLAIMER;
}

/**
 * Annonce de troncature. Le français passe par l'implémentation historique de
 * `src/util/markdown.ts` (une seule source de vérité pour ce rendu).
 */
export function truncationHintFor(count: number, tool: string, lang: BriefLang): string {
  if (count <= 0) return '';
  if (lang !== 'en') return truncationHint(count, tool);
  const template = count > 1 ? TRUNCATION_EN.many : TRUNCATION_EN.one;
  return interpolate(template, { count, tool });
}
