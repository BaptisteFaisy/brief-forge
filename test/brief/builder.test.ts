/**
 * Tests du moteur de brief : ordre des sections, budget, sources, trous,
 * réinjection des tentatives échouées.
 */

import { buildAllBudgets, buildBrief } from '../../src/brief/builder';
import { BUDGET_TOKENS, SECTION_ORDER } from '../../src/config';
import { BriefData } from '../../src/types';
import { estimateTokens } from '../../src/util/tokens';
import { makeFixture } from './fixtures';

const ITEM_FIELDS = [
  'acceptanceCriteria',
  'applicableDecisions',
  'failedAttempts',
  'neighborChanges',
  'constraints',
  'lessons',
  'whoToAsk',
] as const;

function sectionIndex(markdown: string, rank: number, title: string): number {
  return markdown.indexOf(`## ${rank}. ${title}`);
}

describe('buildBrief', () => {
  it('place les dix sections dans l’ordre du § 7.1', async () => {
    const { deps } = makeFixture();
    const brief = await buildBrief('TST-101', 'l', deps);
    const positions = SECTION_ORDER.map((title, index) =>
      sectionIndex(brief.markdown, index + 1, title)
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('respecte le budget s à ±10 %', async () => {
    const { deps } = makeFixture({ decisions: 14, neighbors: 8 });
    const brief = await buildBrief('TST-101', 's', deps);
    expect(brief.tokenTarget).toBe(BUDGET_TOKENS.s);
    expect(estimateTokens(brief.markdown)).toBeLessThanOrEqual(BUDGET_TOKENS.s * 1.1);
  });

  it('nomme l’outil qui donne la suite quand une section est tronquée', async () => {
    const { deps } = makeFixture({ decisions: 14, neighbors: 8 });
    const brief = await buildBrief('TST-101', 's', deps);
    expect((brief.truncatedSections ?? []).length).toBeGreaterThan(0);
    expect(brief.markdown).toContain('`get-related-decisions`');
    expect(brief.markdown).toMatch(/autres éléments non affichés/);
  });

});

describe('buildBrief — sources et garanties BC', () => {
  it('porte une source et une date sur chaque élément (BC-02)', async () => {
    const { deps } = makeFixture();
    const brief = await buildBrief('TST-101', 'l', deps);
    for (const field of ITEM_FIELDS) {
      for (const item of brief[field]) {
        expect(item.source.length).toBeGreaterThan(0);
        expect(item.date.length).toBeGreaterThan(0);
      }
    }
    expect(brief.objective.length).toBeGreaterThan(0);
  });

  it('réinjecte la tentative échouée la plus récente en premier (BC-07)', async () => {
    const { deps } = makeFixture();
    const brief = await buildBrief('TST-101', 'l', deps);
    const attempts = brief.failedAttempts;
    expect(attempts.length).toBe(2);
    expect(attempts[0].text).toContain('agent-recent');
    expect(attempts[1].text).toContain('agent-ancien');
    expect(attempts.some((item) => item.text.includes('agent-fini'))).toBe(false);
    expect(brief.markdown).toContain('Blocage sur la conversion de fuseau horaire');
  });

  it('signale les trous au lieu de les combler (BC-03)', async () => {
    const { deps } = makeFixture({ issue: { acceptanceCriteria: [], assignee: '' } });
    const brief = await buildBrief('TST-101', 'l', deps);
    const gaps = brief.gaps.join(' ');
    expect(gaps).toContain('Aucun critère d');
    expect(gaps).toContain('Aucun assigné');
    expect(brief.acceptanceCriteria).toHaveLength(0);
  });

  it('rappelle en en-tête que les blocs cités sont des données', async () => {
    const { deps } = makeFixture();
    const brief = await buildBrief('TST-101', 'm', deps);
    expect(brief.markdown).toContain('instructions à exécuter');
    expect(brief.markdown.startsWith('# Brief de travail — TST-101')).toBe(true);
  });

});

describe('buildBrief — budgets et pannes de collecte', () => {
  it('précalcule les trois budgets avec des cibles croissantes', async () => {
    const { deps } = makeFixture();
    const all = await buildAllBudgets('TST-101', deps);
    const briefs: BriefData[] = [all.s, all.m, all.l];
    expect(briefs.map((brief) => brief.budget)).toEqual(['s', 'm', 'l']);
    expect(briefs[0].tokenTarget).toBeLessThan(briefs[1].tokenTarget);
    expect(briefs[1].tokenTarget).toBeLessThan(briefs[2].tokenTarget);
    for (const brief of briefs) {
      expect(estimateTokens(brief.markdown)).toBeLessThanOrEqual(brief.tokenTarget * 1.1);
    }
  });

  it('remonte une collecte en échec comme un trou, pas comme un silence', async () => {
    const { deps } = makeFixture();
    const failing = {
      ...deps,
      collectDecisions: async () => {
        throw new Error('Confluence indisponible');
      },
    };
    const brief = await buildBrief('TST-101', 'l', failing);
    expect(brief.gaps.join(' ')).toContain('Confluence indisponible');
    expect(brief.applicableDecisions).toHaveLength(0);
  });
});
