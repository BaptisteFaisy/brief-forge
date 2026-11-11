/**
 * Cycle de vie du travail : conflit de réservation et brief périmé (29 et 30).
 *
 * 29. Ticket déjà réservé par un autre agent (conflit de réservation).
 * 30. Ticket modifié pendant le travail (brief périmé signalé, S7).
 *
 * Les comptes et les trous sont dérivés des graines par `baseFixture()`.
 */

import { NOW, baseFixture, daysAgo, decision, expected } from './seeds';
import type { FixtureSpec } from './types';

/* 29. Ticket déjà réservé par un autre agent (bail de 4 h non expiré) */
const CLAIM_EXPIRES = new Date(NOW.getTime() + 2 * 3_600_000).toISOString();

const FIXTURE_29 = baseFixture({
  key: 'PAY-29',
  scenario: '29 — Ticket déjà réservé par un autre agent',
  claim: {
    agentName: 'cursor',
    userAccountId: 'acc-cursor',
    expiresAt: CLAIM_EXPIRES,
  },
  decisions: [decision('ADR-098 — Verrou coopératif par ticket')],
  expected: expected({ mustAppear: ['ADR-098'] }),
});

/* 30. Ticket modifié pendant le travail (recette S7) */
const FIXTURE_30 = baseFixture({
  key: 'PAY-30',
  scenario: '30 — Ticket modifié pendant le travail (brief périmé)',
  settings: { triggerStatus: 'Prêt à développer' },
  decisions: [decision('ADR-099 — Invalidation sur événement Jira', { date: daysAgo(10) })],
  expected: expected({ mustAppear: ['ADR-099'] }),
});

export const CYCLE_DE_VIE_FIXTURES: FixtureSpec[] = [FIXTURE_29, FIXTURE_30];
