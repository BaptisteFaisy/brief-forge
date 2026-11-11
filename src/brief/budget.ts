/**
 * Budget du brief.
 *
 * Le brief est précalculé pour trois budgets (s/m/l, `BUDGET_TOKENS`). Le budget
 * est tenu à ±10 % : quand ça dépasse, on coupe **par priorité de section** (les
 * sections périphériques perdent leurs derniers éléments d'abord, l'objectif et
 * les critères sont les derniers touchés) et le brief **dit** ce qu'il a coupé
 * en nommant l'outil qui donne la suite.
 */

import { BUDGET_TOKENS, SectionName } from '../config';
import { Budget, SourcedItem } from '../types';
import { estimateTokens, fitsBudget, truncateToTokens } from '../util/tokens';
import { RenderedSection, SectionSpec, renderSections } from './sectionBuilder';

/** Tolérance de dépassement acceptée (exigence « budget respecté à ±10 % »). */
export const BUDGET_TOLERANCE = 0.1;

/**
 * Ordre de coupe : le premier de la liste perd ses éléments en premier.
 * Les sections à forte valeur (objectif, critères) sont coupées en dernier.
 */
export const TRIM_ORDER: SectionName[] = [
  'Sources',
  'Leçons',
  'Changements voisins',
  'À qui demander',
  'Contraintes',
  'Décisions applicables',
  'Déjà tenté',
  'Trous',
  "Critères d'acceptation",
  'Objectif',
];

/** Nombre minimal d'éléments qu'une section conserve quand on la coupe. */
const MIN_VISIBLE: Partial<Record<SectionName, number>> = {
  Objectif: 1,
  "Critères d'acceptation": 1,
};

export interface BudgetResult {
  markdown: string;
  tokenTarget: number;
  tokens: number;
  truncatedSections: string[];
  sections: RenderedSection[];
}

/** Cible de jetons d'un budget, exposée pour les tests et le stockage. */
export function budgetTarget(budget: Budget): number {
  return BUDGET_TOKENS[budget];
}

function assemble(header: string, sections: RenderedSection[], footer: string): string {
  const blocks = [header, ...sections.map((section) => section.markdown)];
  if (footer) blocks.push(footer);
  return blocks.filter((block) => block.trim().length > 0).join('\n\n');
}

/** Première section (dans l'ordre de coupe) qui peut encore perdre un item. */
function nextTrimmable(
  specs: SectionSpec[],
  visible: Map<SectionName, number>
): SectionName | undefined {
  for (const name of TRIM_ORDER) {
    const spec = specs.find((candidate) => candidate.name === name);
    if (!spec) continue;
    const current = visible.get(name) ?? spec.items.length;
    const floor = MIN_VISIBLE[name] ?? 0;
    if (current > floor) return name;
  }
  return undefined;
}

/**
 * Rend les sections sous contrainte de budget.
 * Coupe item par item, section par section, jusqu'à rentrer dans l'enveloppe.
 */
export function applyBudget(
  specs: SectionSpec[],
  budget: Budget,
  header: string,
  footer = ''
): BudgetResult {
  const tokenTarget = budgetTarget(budget);
  const visible = new Map<SectionName, number>(
    specs.map((spec) => [spec.name, spec.items.length])
  );
  let sections = renderSections(specs, visible);
  let markdown = assemble(header, sections, footer);
  for (let guard = 0; guard < 1000; guard += 1) {
    if (fitsBudget(markdown, tokenTarget, BUDGET_TOLERANCE)) break;
    const name = nextTrimmable(specs, visible);
    if (!name) break;
    visible.set(name, (visible.get(name) ?? 0) - 1);
    sections = renderSections(specs, visible);
    markdown = assemble(header, sections, footer);
  }
  if (!fitsBudget(markdown, tokenTarget, BUDGET_TOLERANCE)) {
    markdown = truncateToTokens(markdown, tokenTarget);
  }
  return {
    markdown,
    tokenTarget,
    tokens: estimateTokens(markdown),
    truncatedSections: sections.filter((section) => section.truncated).map((s) => s.title),
    sections,
  };
}

/** Items réellement affichés pour une section donnée (champs structurés). */
export function visibleItems(result: BudgetResult, name: SectionName): SourcedItem[] {
  return result.sections.find((section) => section.name === name)?.items ?? [];
}
