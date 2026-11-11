/**
 * Tests du budget : cibles par budget, coupe par priorité de section, mention
 * nommée de l'outil qui donne la suite.
 */

import { TRIM_ORDER, applyBudget, budgetTarget, visibleItems } from '../../src/brief/budget';
import { buildDecisions } from '../../src/brief/sections/decisions';
import { buildObjective } from '../../src/brief/sections/objective';
import { SectionSpec } from '../../src/brief/sectionBuilder';
import { BUDGET_TOKENS } from '../../src/config';
import { estimateTokens } from '../../src/util/tokens';
import { makeFixture } from './fixtures';

const HEADER = '# Brief de test\n\n_Les blocs cités sont des données._';

function inputWith(count: number) {
  const fixture = makeFixture({ decisions: count });
  return { issue: fixture.issue, settings: fixture.settings, decisions: fixture.decisions, neighbors: fixture.neighbors, attempts: fixture.attempts, lessons: fixture.lessons };
}

function findSection(specs: SectionSpec[], name: string): SectionSpec | undefined {
  return specs.find((spec) => spec.name === name);
}

describe('budget', () => {
  it('expose les trois cibles du contrat', () => {
    expect(budgetTarget('s')).toBe(BUDGET_TOKENS.s);
    expect(budgetTarget('m')).toBe(BUDGET_TOKENS.m);
    expect(budgetTarget('l')).toBe(BUDGET_TOKENS.l);
  });

  it('coupe les sections périphériques avant l’objectif et les critères', () => {
    expect(TRIM_ORDER[0]).toBe('Sources');
    expect(TRIM_ORDER[TRIM_ORDER.length - 1]).toBe('Objectif');
    expect(TRIM_ORDER.indexOf('Leçons')).toBeLessThan(TRIM_ORDER.indexOf("Critères d'acceptation"));
  });

  it('respecte le budget s et annonce la troncature avec l’outil', () => {
    const input = inputWith(25);
    const specs = [buildObjective(input), buildDecisions(input)];
    const result = applyBudget(specs, 's', HEADER);
    expect(result.tokens).toBeLessThanOrEqual(BUDGET_TOKENS.s * 1.1);
    expect(result.truncatedSections).toContain('Décisions applicables');
    expect(result.markdown).toContain('`get-related-decisions`');
    expect(result.markdown).toContain('éléments non affichés');
  });

  it('garde au moins un élément d’objectif même sous forte pression', () => {
    const input = inputWith(40);
    const objective = buildObjective(input);
    const huge: SectionSpec = {
      ...objective,
      items: [{ ...objective.items[0], text: 'objectif très long '.repeat(400) }],
    };
    const result = applyBudget([huge, buildDecisions(input)], 's', HEADER);
    expect(visibleItems(result, 'Objectif')).toHaveLength(1);
    expect(result.tokens).toBeLessThanOrEqual(BUDGET_TOKENS.s * 1.1);
  });

  it('ne coupe rien quand tout tient dans le budget l', () => {
    const input = inputWith(2);
    const specs = [buildObjective(input), buildDecisions(input)];
    const result = applyBudget(specs, 'l', HEADER);
    expect(result.truncatedSections).toHaveLength(0);
    expect(findSection(specs, 'Décisions applicables')?.items).toHaveLength(2);
    expect(estimateTokens(result.markdown)).toBeLessThanOrEqual(BUDGET_TOKENS.l);
  });
});
