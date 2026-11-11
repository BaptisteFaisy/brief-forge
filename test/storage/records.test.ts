/** Tests des repos `readiness`, `attempt` et `review`. */

import { FakeSqlClient } from './fakeSqlClient';
import { BUILT_AT, makeAttempt, makeReadiness } from './fixtures';
import { resetSqlClient, setSqlClient } from '../../src/storage/sqlClient';
import { loadReadiness, saveReadiness } from '../../src/storage/readinessRepo';
import { loadAttempt, loadAttempts, saveAttempt } from '../../src/storage/attemptRepo';
import { loadReviews, saveReview } from '../../src/storage/reviewRepo';

describe('readinessRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('enregistre le score et ses trous en JSON', async () => {
    await saveReadiness(makeReadiness('PAY-142', 72), BUILT_AT);

    const [row] = fake.rowsOf('readiness');
    expect(row.ready).toBe(1);
    expect(row.computed_at).toBe(BUILT_AT);
    expect(JSON.parse(String(row.gaps_json))[0].criterion).toBe('périmètre borné');
  });

  it('relit le score sous forme typée', async () => {
    await saveReadiness(makeReadiness('PAY-142', 42), BUILT_AT);
    const score = await loadReadiness('PAY-142');

    expect(score).toMatchObject({ issueKey: 'PAY-142', score: 42, ready: false, status: 'à préciser' });
    expect(score?.gaps).toHaveLength(1);
  });

  it('écrase le score précédent (un seul par ticket)', async () => {
    await saveReadiness(makeReadiness('PAY-142', 30), BUILT_AT);
    await saveReadiness(makeReadiness('PAY-142', 85), '2026-11-11T11:00:00.000Z');

    expect(fake.rowsOf('readiness')).toHaveLength(1);
    expect((await loadReadiness('PAY-142'))?.score).toBe(85);
  });

  it('renvoie null si aucun score', async () => {
    expect(await loadReadiness('PAY-999')).toBeNull();
  });
});

describe('attemptRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('renvoie les tentatives du ticket, les plus récentes d’abord', async () => {
    await saveAttempt(makeAttempt({ id: 'a-old', startedAt: '2026-11-01T10:00:00.000Z' }));
    await saveAttempt(makeAttempt({ id: 'a-new', startedAt: '2026-11-10T10:00:00.000Z' }));
    await saveAttempt(makeAttempt({ id: 'a-mid', startedAt: '2026-11-05T10:00:00.000Z' }));
    await saveAttempt(makeAttempt({ id: 'other', issueKey: 'OPS-7' }));

    const attempts = await loadAttempts('PAY-142');
    expect(attempts.map((attempt) => attempt.id)).toEqual(['a-new', 'a-mid', 'a-old']);
  });

  it('conserve les champs du compte rendu', async () => {
    await saveAttempt(makeAttempt({ reportMd: '## Statut : bloqué', testsPassed: 'non' }));
    const [attempt] = await loadAttempts('PAY-142');

    expect(attempt).toMatchObject({
      agentName: 'rovo-agent',
      status: 'partiel',
      reportMd: '## Statut : bloqué',
      criteriaCovered: '1',
      testsPassed: 'non',
    });
  });

  it('relit une tentative par identifiant', async () => {
    await saveAttempt(makeAttempt());
    expect((await loadAttempt('attempt-1'))?.issueKey).toBe('PAY-142');
    expect(await loadAttempt('inconnu')).toBeNull();
  });

  it('renvoie un tableau vide sans tentative', async () => {
    expect(await loadAttempts('PAY-999')).toEqual([]);
  });
});

describe('reviewRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('enregistre et relit les revues, les plus récentes d’abord', async () => {
    await saveReview({
      id: 'r-1',
      issueKey: 'PAY-142',
      attemptId: 'attempt-1',
      reviewerName: 'baptiste',
      verdict: 'accepté',
      commentMd: 'RAS',
      createdAt: '2026-11-01T09:00:00.000Z',
    });
    await saveReview({
      id: 'r-2',
      issueKey: 'PAY-142',
      attemptId: 'attempt-1',
      reviewerName: 'baptiste',
      verdict: 'à revoir',
      commentMd: 'tests manquants',
      createdAt: '2026-11-08T09:00:00.000Z',
    });

    const reviews = await loadReviews('PAY-142');
    expect(reviews.map((review) => review.id)).toEqual(['r-2', 'r-1']);
    expect(reviews[0].verdict).toBe('à revoir');
    expect(fake.rowsOf('review')).toHaveLength(2);
  });
});
