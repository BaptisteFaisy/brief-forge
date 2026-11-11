/**
 * Budget du brief.
 *
 * Le brief est précalculé pour trois budgets (s/m/l, `BUDGET_TOKENS`). Le budget
 * est tenu à ±10 % : quand ça dépasse, on coupe **par priorité de section** (les
 * sections périphériques perdent leurs derniers éléments d'abord, l'objectif et
 * les critères sont les derniers touchés) et le brief **dit** ce qu'il a coupé
 * en nommant l'outil qui donne la suite.
 *
 * Si la coupe d'éléments ne suffit pas (un seul élément immense), on compacte
 * les textes affichés plutôt que de tronquer le Markdown : les dix sections
 * restent présentes, et leurs éléments gardent leur source et leur date.
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
const MIN_VISIBLE = 1;

/** Nombre maximal de passes de compaction des textes. */
const MAX_COMPACTIONS = 12;

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
    if (current > MIN_VISIBLE) return name;
  }
  return undefined;
}

/** Rendu courant des sections, avec le compte d'items visibles par section. */
function render(specs: SectionSpec[], visible: Map<SectionName, number>): RenderedSection[] {
  return renderSections(specs, visible);
}

/**
 * Compacte les textes des items visibles : le texte le plus long de chaque
 * section est raccourci, sa source et sa date sont conservées.
 */
function compactTexts(specs: SectionSpec[], visible: Map<SectionName, number>): SectionSpec[] {
  return specs.map((spec) => {
    const count = visible.get(spec.name) ?? spec.items.length;
    const shown = spec.items.slice(0, count);
    if (shown.length === 0) return spec;
    const longest = shown.reduce(
      (max, item) => Math.max(max, estimateTokens(item.text)),
      0
    );
    if (longest <= 24) return spec;
    const cap = Math.max(16, Math.floor(longest / 2));
    const items = spec.items.map((item, index) =>
      index < count ? { ...item, text: truncateToTokens(item.text, cap) } : item
    );
    return { ...spec, items };
  });
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
  let working = specs;
  let sections = render(working, visible);
  let markdown = assemble(header, sections, footer);
  for (let guard = 0; guard < 1000; guard += 1) {
    if (fitsBudget(markdown, tokenTarget, BUDGET_TOLERANCE)) break;
    const name = nextTrimmable(working, visible);
    if (!name) break;
    visible.set(name, (visible.get(name) ?? 0) - 1);
    sections = render(working, visible);
    markdown = assemble(header, sections, footer);
  }
  for (let pass = 0; pass < MAX_COMPACTIONS; pass += 1) {
    if (fitsBudget(markdown, tokenTarget, BUDGET_TOLERANCE)) break;
    working = compactTexts(working, visible);
    sections = render(working, visible);
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
