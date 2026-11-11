/**
 * Tests des sections : marquage des décisions anciennes, ordre des tentatives,
 * contacts dédupliqués, trous signalés, sources dédupliquées.
 */

import { contacts } from '../../src/brief/sections/whoToAsk';
import { decisionItems } from '../../src/brief/sections/decisions';
import { failedAttempts } from '../../src/brief/sections/alreadyTried';
import { gapList } from '../../src/brief/sections/gaps';
import { sortedNeighbors } from '../../src/brief/sections/neighborChanges';
import { sourceRefs } from '../../src/brief/sections/sources';
import { hasSource, renderSection } from '../../src/brief/sectionBuilder';
import { BriefInput } from '../../src/brief/inputs';
import { OLD_DATE, RECENT_DATE, makeDecision, makeFixture } from './fixtures';

const ITEM_SOURCED = {
  text: 'Jira TST-101 — /browse/TST-101',
  source: 'Référence',
  date: RECENT_DATE,
};

function toInput(fixture: ReturnType<typeof makeFixture>): BriefInput {
  return {
    issue: fixture.issue,
    settings: fixture.settings,
    decisions: fixture.decisions,
    neighbors: fixture.neighbors,
    attempts: fixture.attempts,
    lessons: fixture.lessons,
  };
}

describe('sections', () => {
  it('marque une décision de plus de 18 mois « ancienne, à confirmer »', () => {
    const items = decisionItems([
      makeDecision(1, { date: OLD_DATE }),
      makeDecision(2, { date: RECENT_DATE }),
    ]);
    expect(items[0].text).toContain('(ancienne, à confirmer)');
    expect(items[0].stale).toBe(true);
    expect(items[1].text).not.toContain('ancienne, à confirmer');
    expect(items[1].stale).toBe(false);
  });

  it('trie les tentatives échouées de la plus récente à la plus ancienne (BC-07)', () => {
    const fixture = makeFixture();
    const ordered = failedAttempts(fixture.attempts);
    expect(ordered.map((attempt) => attempt.id)).toEqual(['a-new', 'a-old']);
  });

});

describe('sections — interlocuteurs, trous et sources', () => {
  it('déduplique les interlocuteurs et garde leur signal le plus récent', () => {
    const input = toInput(makeFixture());
    const list = contacts(input);
    const names = list.map((contact) => contact.name);
    expect(names).toContain('luc');
    expect(names.filter((name) => name === 'luc')).toHaveLength(1);
    expect(list[0].name).toBe('luc');
    expect(list.find((contact) => contact.name === 'amina')?.date).toBe(OLD_DATE);
  });

  it('tient hors des interlocuteurs un commentaire à visibilité restreinte', () => {
    const fixture = makeFixture({
      issue: {
        comments: [
          { id: 'c1', author: 'luc', createdAt: RECENT_DATE, body: 'Je prends le ticket.' },
          {
            id: 'c2',
            author: 'juridique',
            createdAt: RECENT_DATE,
            body: 'Note interne confidentielle sur ce client.',
            visibility: 'restricted',
          },
        ],
      },
    });
    const names = contacts(toInput(fixture)).map((contact) => contact.name);
    expect(names).toContain('luc');
    expect(names).not.toContain('juridique');
  });

  it('signale les trous quand une donnée manque, sans la combler', () => {
    const fixture = makeFixture({
      issue: { acceptanceCriteria: [], assignee: '', components: [] },
      settings: { componentZone: undefined },
    });
    const gaps = gapList(toInput(fixture));
    expect(gaps.join(' ')).toContain("Aucun critère d'acceptation");
    expect(gaps.join(' ')).toContain('Aucun assigné');
    expect(gaps.join(' ')).toContain('Aucun composant');
    expect(gaps.join(' ')).not.toContain('Aucune tentative');
  });

  it('ne signale aucun trou quand le brief a tout trouvé', () => {
    const fixture = makeFixture();
    expect(gapList(toInput(fixture))).toEqual([]);
  });

});

describe('sections — rendu et troncature', () => {
  it('déduplique les sources par URL et les date toutes', () => {
    const fixture = makeFixture({ decisions: 2, neighbors: 2 });
    const refs = sourceRefs(toInput(fixture));
    const urls = refs.map((ref) => ref.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(refs.every((ref) => ref.date.length > 0)).toBe(true);
    expect(urls).toContain('https://exemple.atlassian.net/wiki/pages/1');
  });

  it('trie les changements voisins du plus récent au plus ancien', () => {
    const fixture = makeFixture();
    fixture.neighbors[0].date = OLD_DATE;
    const ordered = sortedNeighbors(fixture.neighbors);
    expect(ordered[ordered.length - 1].date).toBe(OLD_DATE);
  });

});

describe('sections — filtrage des items non sourcés', () => {
  it('n’affiche que des éléments sourcés et datés', () => {
    const fixture = makeFixture();
    const spec = {
      name: 'Leçons' as const,
      rank: 7,
      title: 'Leçons',
      tool: 'get-work-brief',
      kind: 'bullets' as const,
      items: [
        { text: 'sourcé', source: 'Jira TST-101', date: RECENT_DATE },
        { text: 'sans source', source: '', date: RECENT_DATE },
        { text: 'sans date', source: 'Jira TST-101', date: '' },
      ],
    };
    const rendered = renderSection(spec, 5);
    expect(rendered.items).toHaveLength(1);
    expect(rendered.items.every(hasSource)).toBe(true);
    expect(fixture.issue.issueKey).toBe('TST-101');
  });

  it('dit qu’une section est coupée au lieu de la dire vide', () => {
    const spec = {
      name: 'Sources' as const,
      rank: 10,
      title: 'Sources',
      tool: 'get-work-brief',
      kind: 'bullets' as const,
      items: [ITEM_SOURCED, { ...ITEM_SOURCED, text: 'autre source' }],
    };
    const rendered = renderSection(spec, 0);
    expect(rendered.markdown).toContain('`get-work-brief`');
    expect(rendered.markdown).not.toContain('Rien de sourcé');
    expect(rendered.truncated).toBe(true);
    expect(rendered.hidden).toBe(2);
  });
});
