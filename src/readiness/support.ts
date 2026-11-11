/**
 * Helpers partagés du score de préparation.
 *
 * Un seul endroit pour : l'analyse de texte (normalisation, découpage,
 * détection de signal vérifiable), la fabrication d'un résultat de critère,
 * le statut et le conseil. Les sept critères et le scorer s'appuient dessus —
 * aucun d'eux ne réimplémente une de ces règles.
 */

import { READINESS_THRESHOLDS, READINESS_WEIGHTS } from '../config';
import type { ReadinessScore } from '../types';
import type { CriterionKey, CriterionOutcome } from './types';

/* ------------------------------------------------------------------ */
/* Texte                                                              */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'dans', 'avec', 'pour', 'cette', 'celui', 'elle', 'nous', 'vous', 'leur',
  'plus', 'mais', 'sans', 'tout', 'tous', 'toute', 'toutes', 'être', 'avoir',
  'fait', 'faire', 'doit', 'peut', 'aussi', 'donc', 'alors', 'quand', 'comme',
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'should', 'must',
  'will', 'have', 'been', 'when', 'then', 'than', 'into', 'not', 'are',
]);

/**
 * Minuscules, sans accents, sans apostrophes : toutes les comparaisons
 * passent par ici (« Critères d'acceptation » → « criteres dacceptation »).
 */
export function normalizeText(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase();
}

export function countWords(text: string): number {
  const trimmed = (text ?? '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Découpe un bloc en éléments : lignes, puces, points-virgules. */
export function splitItems(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n|;|•/)
    .map((line) => stripItemMarker(line))
    .filter((line) => line.length > 0);
}

/** Retire les marqueurs de liste successifs (« - [ ] », « 1. », « * »). */
function stripItemMarker(line: string): string {
  let cleaned = line.trim();
  const marker = /^(?:[-*+]|\d+[.)]|\[[ xX]\])\s*/;
  while (marker.test(cleaned)) {
    cleaned = cleaned.replace(marker, '').trim();
  }
  return cleaned;
}

/** Extrait les mots porteurs de sens (hors mots vides, hors bruit). */
export function significantWords(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

/** Extrait d'un texte long, pour citer une raison sans noyer le lecteur. */
export function quoteExcerpt(text: string, maxLength = 90): string {
  const compact = (text ?? '').replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}…`;
}

/** En dessous, la description ne porte pas d'objectif exploitable. */
export const MIN_DESCRIPTION_WORDS = 10;

/* ------------------------------------------------------------------ */
/* Sections de description                                            */
/* ------------------------------------------------------------------ */

/**
 * Reconnaît une ligne de titre de section. Retourne `null` si la ligne n'est
 * pas un titre cherché, sinon le contenu inline resté après les deux-points.
 */
function matchHeading(line: string, titles: string[]): string | null {
  const colonIndex = line.indexOf(':');
  const head = colonIndex === -1 ? line : line.slice(0, colonIndex);
  const cleaned = normalizeText(head).replace(/^[#*\s>-]+/, '').trim();
  const matched = titles.some(
    (title) => cleaned === title || cleaned === `${title}s` || cleaned.startsWith(`${title} `)
  );
  if (!matched) return null;
  return colonIndex === -1 ? '' : line.slice(colonIndex + 1).trim();
}

/**
 * Contenu des sections dont le titre fait partie de `titles`, jusqu'au titre
 * suivant. Sert aux critères d'acceptation écrits dans la description.
 */
export function extractSection(description: string, titles: string[]): string[] {
  if (!description) return [];
  const normalizedTitles = titles.map(normalizeText);
  const collected: string[] = [];
  let inside = false;
  for (const line of description.split(/\r?\n/)) {
    const inline = matchHeading(line, normalizedTitles);
    if (inline !== null) {
      inside = true;
      if (inline) collected.push(inline);
      continue;
    }
    if (inside && /^#{1,6}\s/.test(line)) break;
    if (inside && line.trim()) collected.push(line.trim());
  }
  return collected;
}

/* ------------------------------------------------------------------ */
/* Signaux                                                            */
/* ------------------------------------------------------------------ */

const VERIFIABLE_PATTERNS: RegExp[] = [
  /\b(etant donne|given|quand|when|alors|then)\b/,
  /\b(affiche|afficher|retourne|retourner|renvoie|renvoyer|refuse|refuser|leve|lever|rejette|rejeter)\b/,
  /\b(cree|creer|supprime|supprimer|enregistre|enregistrer|calcule|calculer|genere|generer)\b/,
  /\b(permet|empeche|bloque|echoue|valide|journalise|redirige|ajoute|exporte|importe)\b/,
  /\b(doit|devra|peut|au plus|au moins|maximum|minimum|sans erreur)\b/,
  /\b(teste|test|verifie|verifier|mesure|mesurer)\b/,
  /\d/,
  /(>=|<=|>|<|=|%)/,
  /\[[ x]\]/,
];

/** Vrai si l'élément décrit un résultat observable, donc vérifiable. */
export function hasVerifiableSignal(text: string): boolean {
  if (countWords(text) < 3) return false;
  const normalized = normalizeText(text);
  return VERIFIABLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

const QUESTION_PATTERN = /\?/;

/** Vrai si le corps de commentaire contient une question exploitable. */
export function isQuestion(body: string): boolean {
  if (!QUESTION_PATTERN.test(body ?? '')) return false;
  if (countWords(body) < 3) return false;
  return !/^\s*>/.test(body.trim());
}

/* ------------------------------------------------------------------ */
/* Résultat de critère, statut, conseil                               */
/* ------------------------------------------------------------------ */

/**
 * Fabrique le résultat d'un critère. Le maximum vient **toujours** du barème
 * de `config.ts` : aucun poids n'est recopié dans les critères.
 */
export function buildOutcome(
  criterion: CriterionKey,
  passed: boolean,
  reason?: string
): CriterionOutcome {
  const maxPoints = READINESS_WEIGHTS[criterion];
  if (!passed && !reason) {
    throw new Error(`Critère ${criterion} en échec sans raison : point perdu muet interdit.`);
  }
  return {
    criterion,
    passed,
    points: passed ? maxPoints : 0,
    maxPoints,
    reason: passed ? undefined : reason,
  };
}

/** Ce qu'il faut corriger, critère par critère (une seule source). */
const REMEDIATION: Record<CriterionKey, string> = {
  acceptanceCriteria:
    'écrire 2 à 5 critères d’acceptation observables (ex. « le bouton Export renvoie un CSV de moins de 5 Mo »)',
  boundedScope:
    'ramener le ticket à un seul objectif et un seul composant, découper le reste en tickets liés',
  noBlockingLink:
    'lever ou fermer les liens bloquants, ou attendre qu’ils soient terminés avant de confier le ticket',
  noContradictoryDecision:
    'trancher entre les décisions qui se contredisent et consigner la décision retenue',
  reachableAuthor:
    'désigner un responsable actif (assigné ou rapporteur) joignable pour répondre aux questions',
  noUnansweredQuestion:
    'répondre aux questions en suspens dans les commentaires avant de lancer un agent',
  componentIdentified:
    'renseigner le composant Jira (ou la zone de code) où le travail doit être fait',
};

export function remediationFor(criterion: string): string {
  return REMEDIATION[criterion as CriterionKey] ?? 'préciser ce point du ticket';
}

/**
 * Libellé lisible d'un critère, affiché tel quel dans l'UI (bandeau Jira,
 * `GapList`). Les clés techniques ne sortent jamais vers l'utilisateur.
 */
const LABELS: Record<string, string> = {
  acceptanceCriteria: 'Critères d’acceptation vérifiables',
  boundedScope: 'Périmètre borné',
  noBlockingLink: 'Aucun lien bloquant ouvert',
  noContradictoryDecision: 'Aucune décision contradictoire',
  reachableAuthor: 'Auteur joignable',
  noUnansweredQuestion: 'Aucune question sans réponse',
  componentIdentified: 'Composant identifié',
  objective: 'Objectif écrit',
};

export function criterionLabel(criterion: string): string {
  return LABELS[criterion] ?? criterion;
}

/** Statut déduit du score, seuils lus dans `config.ts`. */
export function statusFor(score: number): ReadinessScore['status'] {
  if (score >= READINESS_THRESHOLDS.ready) return 'prêt';
  if (score >= READINESS_THRESHOLDS.needsPrecision) return 'à préciser';
  return 'non prêt';
}

/**
 * Conseil actionnable : nomme les deux plus gros manques et l'action qui les
 * corrige. Un score sans « quoi faire » ne sert à rien.
 */
export function buildAdvice(
  status: ReadinessScore['status'],
  outcomes: CriterionOutcome[],
  attemptCount: number
): string {
  const lost = outcomes
    .filter((outcome) => !outcome.passed)
    .sort((a, b) => b.maxPoints - a.maxPoints)
    .slice(0, 2);

  if (status === 'prêt') {
    const attemptNote =
      attemptCount > 0
        ? ` ${attemptCount} tentative(s) déjà enregistrée(s) : relire le brief « Déjà tenté » avant de commencer.`
        : '';
    return `Prêt pour un agent : le brief peut être généré tel quel.${attemptNote}`;
  }

  const actions = lost.map((outcome) => remediationFor(outcome.criterion)).join(' ; puis ');
  if (status === 'à préciser') {
    return `À préciser avant de confier le ticket : ${actions}.`;
  }
  return `Non prêt : ${actions}. Sans cela, un agent travaillerait sur des hypothèses fausses.`;
}
