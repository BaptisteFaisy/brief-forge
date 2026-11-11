const demo = require('../../site/assets/demo.js');

const data = {
  live: { origin: 'live', key: 'PAY-6', briefs: { m: { tokenTarget: 3000, markdown: 'x' } } },
  tickets: [
    {
      key: 'CMD-1', scenario: 'ticket nominal', projectKey: 'CMD', summary: 'x', status: 'open',
      briefs: {
        s: { tokenTarget: 1000, markdown: 's brief' },
        m: { tokenTarget: 3000, markdown: 'm brief' },
        l: { tokenTarget: 8000, markdown: 'l brief' },
      },
      readiness: { score: 39, ready: false, gaps: [], advice: 'a' },
    },
  ],
};

describe('demo selectors', () => {
  test('selectEntry returns the live brief for "live"', () => {
    expect(demo.selectEntry(data, 'live')).toBe(data.live);
  });

  test('selectEntry finds a ticket by key and null for unknown', () => {
    expect(demo.selectEntry(data, 'CMD-1')).toBe(data.tickets[0]);
    expect(demo.selectEntry(data, 'NOPE')).toBeNull();
    expect(demo.selectEntry(null, 'CMD-1')).toBeNull();
  });

  test('availableBudgets lists s/m/l for a ticket but only m for live', () => {
    expect(demo.availableBudgets(data.tickets[0])).toEqual(['s', 'm', 'l']);
    expect(demo.availableBudgets(data.live)).toEqual(['m']);
  });

  test('selectBrief returns the brief for a budget, null otherwise', () => {
    expect(demo.selectBrief(data.tickets[0], 'm').markdown).toBe('m brief');
    expect(demo.selectBrief(data.live, 's')).toBeNull();
  });
});

describe('demo formatting', () => {
  test('formatScore renders "39/100" and "—" for missing', () => {
    expect(demo.formatScore({ score: 39 })).toBe('39/100');
    expect(demo.formatScore({})).toBe('—');
  });

  test('formatGap renders criterion, point cost and reason', () => {
    const gap = { criterion: 'Critères d\'acceptation', pointsLost: 30, reason: 'aucun critère' };
    expect(demo.formatGap(gap)).toBe('Critères d\'acceptation (−30) — aucun critère');
    expect(demo.formatGap({ criterion: 'Périmètre', reason: 'non borné' })).toBe('Périmètre — non borné');
  });

  test('formatDuration formats ms and seconds', () => {
    expect(demo.formatDuration(820)).toBe('820 ms');
    expect(demo.formatDuration(1420)).toBe('1.4 s');
    expect(demo.formatDuration(undefined)).toBe('—');
  });

  test('findSecretLines isolates masked secret markers', () => {
    const md = 'a\n- jeton [SECRET:OPENAI_KEY] — _src_\n- rien\n';
    expect(demo.findSecretLines(md)).toEqual(['- jeton [SECRET:OPENAI_KEY] — _src_']);
  });

  test('findRejectedLines isolates flagged dropped instructions', () => {
    const md = 'a\n- 3 passage(s) écarté(s) du brief : instruction suspecte — _x_\n- rien\n';
    expect(demo.findRejectedLines(md))
      .toEqual(['- 3 passage(s) écarté(s) du brief : instruction suspecte — _x_']);
  });
});