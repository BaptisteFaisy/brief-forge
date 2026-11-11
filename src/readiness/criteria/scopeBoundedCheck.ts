/**
 * Critère « périmètre borné » — 15 points.
 *
 * Un agent travaille bien sur un objectif unique et une zone de code unique.
 * Le critère échoue dès qu'un signal dit le contraire : description absente
 * (périmètre invérifiable), épique, taille excessive, plusieurs composants,
 * plusieurs objectifs dans le résumé, formulation « refonte de tout ».
 *
 * Les deux premiers objectifs proches restent acceptables (un ticket
 * « exporter en CSV et filtrer par date » est exécutable) ; c'est à partir de
 * trois objectifs distincts que le ticket n'est plus borné.
 *
 * Chaque signal est une petite garde autonome (`ScopeGuard`) : la liste des
 * gardes est la seule chose à modifier pour ajouter un cas.
 */

import { buildOutcome, countWords, MIN_DESCRIPTION_WORDS, normalizeText, quoteExcerpt } from '../support';
import type { CriterionInput, CriterionOutcome, IssueSnapshot } from '../types';

const MAX_DESCRIPTION_WORDS = 600;
const MAX_OBJECTIVES = 2;
const MAX_CRITERIA = 10;

const BROAD_PATTERNS: RegExp[] = [
  /refonte (complete|globale|entiere)/,
  /reecriture (complete|globale)/,
  /migration complete/,
  /tous les (modules|ecrans|services|projets)/,
  /toute l?application/,
  /l?ensemble (de|du|des) /,
  /plusieurs (modules|ecrans|services)/,
  /gros chantier/,
  /clean ?up general/,
  /au passage,? /,
];

/** Une garde renvoie la raison du refus, ou `null` si le signal est absent. */
type ScopeGuard = (issue: IssueSnapshot) => string | null;

/** Compte les objectifs distincts annoncés dans le résumé. */
function countObjectives(summary: string): number {
  const parts = normalizeText(summary)
    .split(/\s+(?:et|puis|ainsi que|\+)\s+/)
    .map((part) => part.trim())
    .filter((part) => countWords(part) >= 2);
  return Math.max(parts.length, 1);
}

function findBroadSignal(text: string): string | null {
  const normalized = normalizeText(text);
  const pattern = BROAD_PATTERNS.find((candidate) => candidate.test(normalized));
  return pattern ? pattern.source : null;
}

const descriptionMissing: ScopeGuard = (issue) =>
  countWords(issue.description) < MIN_DESCRIPTION_WORDS
    ? 'description absente ou squelettique : le périmètre n’est pas écrit, donc pas borné.'
    : null;

const epicType: ScopeGuard = (issue) =>
  /^epi(c|que)/.test(normalizeText(issue.issueType).trim())
    ? `ticket de type « ${issue.issueType} » : un épique n’est pas un périmètre exécutable, le découper en sous-tâches.`
    : null;

const broadWording: ScopeGuard = (issue) =>
  findBroadSignal(`${issue.summary}\n${issue.description ?? ''}`)
    ? `formulation de périmètre large (« ${quoteExcerpt(issue.summary, 60)} ») : découper en tickets d’un seul objectif.`
    : null;

const oversizedDescription: ScopeGuard = (issue) => {
  const words = countWords(issue.description);
  return words > MAX_DESCRIPTION_WORDS
    ? `description de ${words} mots (maximum ${MAX_DESCRIPTION_WORDS}) : trop de matière pour un seul objectif.`
    : null;
};

const tooManyComponents: ScopeGuard = (issue) => {
  const components = (issue.components ?? []).filter((component) => component.trim());
  return components.length > 1
    ? `${components.length} composants touchés (${components.slice(0, 3).join(', ')}) : un ticket = une zone.`
    : null;
};

const tooManyObjectives: ScopeGuard = (issue) => {
  const objectives = countObjectives(issue.summary);
  return objectives > MAX_OBJECTIVES
    ? `${objectives} objectifs annoncés dans le résumé : n’en garder qu’un par ticket.`
    : null;
};

const tooManyCriteria: ScopeGuard = (issue) => {
  const count = (issue.acceptanceCriteria ?? []).filter((item) => item.trim()).length;
  return count > MAX_CRITERIA
    ? `${count} critères d’acceptation (maximum ${MAX_CRITERIA}) : le lot est trop gros pour une seule passe d’agent.`
    : null;
};

/** Signaux de périmètre trop large, du plus structurel au plus fin. */
const SCOPE_GUARDS: ScopeGuard[] = [
  descriptionMissing,
  epicType,
  broadWording,
  oversizedDescription,
  tooManyComponents,
  tooManyObjectives,
  tooManyCriteria,
];

export function checkScopeBounded(input: CriterionInput): CriterionOutcome {
  for (const guard of SCOPE_GUARDS) {
    const reason = guard(input.issue);
    if (reason) {
      return buildOutcome('boundedScope', false, reason);
    }
  }
  return buildOutcome('boundedScope', true);
}
