/**
 * Test de tenue du budget sous forte pression.
 *
 * Un ticket énorme (description géante, 200 décisions, 100 changements) ne doit
 * produire ni un brief hors budget, ni un brief amputé de sections : les dix
 * sections du § 7.1 restent là, et les éléments conservés gardent source et
 * date.
 */

import { buildBrief } from '../../src/brief/builder';
import { SECTION_ORDER } from '../../src/config';
import { estimateTokens } from '../../src/util/tokens';
import { makeFixture } from './fixtures';

describe('budget sous forte pression', () => {
  const fixture = makeFixture({
    decisions: 200,
    neighbors: 100,
    issue: { description: 'description très longue '.repeat(2000) },
  });

  it('reste dans le budget s et garde les dix sections', async () => {
    const brief = await buildBrief('TST-101', 's', fixture.deps);
    expect(estimateTokens(brief.markdown)).toBeLessThanOrEqual(1000 * 1.1);
    SECTION_ORDER.forEach((title, index) => {
      expect(brief.markdown).toContain(`## ${index + 1}. ${title}`);
    });
  });

  it('conserve une source et une date sur les éléments encore affichés', async () => {
    const brief = await buildBrief('TST-101', 's', fixture.deps);
    expect(brief.acceptanceCriteria.length).toBeGreaterThan(0);
    for (const item of brief.acceptanceCriteria) {
      expect(item.source.length).toBeGreaterThan(0);
      expect(item.date.length).toBeGreaterThan(0);
    }
  });
});
