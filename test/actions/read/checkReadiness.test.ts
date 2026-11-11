/** Tests de l'outil `check-readiness` : score stocké, calcul, forme de réponse. */

import { checkReadiness } from '../../../src/actions/checkReadiness';
import { PermissionDeniedError } from '../../../src/util/errors';
import {
  ACCOUNT_ID,
  CONTEXT,
  ISSUE_KEY,
  asFailure,
  collectDoubles,
  guardDoubles,
  makeAttempt,
  makeDecision,
  makeIssue,
  makeReadiness,
  primeDoubles,
  resetDoubles,
  storageDoubles,
} from './doubles';

jest.mock('../../../src/security/permissionGuard', () => require('./doubles').guardDoubles);
jest.mock('../../../src/collect/issueCollector', () => require('./doubles').collectDoubles);
jest.mock('../../../src/storage', () => require('./doubles').storageDoubles);

beforeEach(() => {
  resetDoubles();
  primeDoubles();
});

describe('check-readiness — validation des entrées', () => {
  it('refuse un appel sans issueKey', async () => {
    const failure = asFailure(await checkReadiness({}, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.error).toContain('issueKey');
    expect(collectDoubles.collectIssue).not.toHaveBeenCalled();
  });

  it('refuse une clé de ticket mal formée', async () => {
    const failure = asFailure(await checkReadiness({ issueKey: 'pas une clé' }, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
  });
});

describe('check-readiness — score stocké', () => {
  it('sert le score enregistré sans recalculer', async () => {
    storageDoubles.loadReadiness.mockResolvedValue(makeReadiness(64));

    const result = await checkReadiness({ issueKey: ISSUE_KEY }, CONTEXT);

    expect(result).toMatchObject({
      issueKey: ISSUE_KEY,
      score: 64,
      status: 'à préciser',
      ready: false,
    });
    expect(collectDoubles.collectIssue).not.toHaveBeenCalled();
    expect(storageDoubles.saveReadiness).not.toHaveBeenCalled();
    expect(storageDoubles.logAccess).toHaveBeenCalledWith(
      ISSUE_KEY,
      'check-readiness',
      ACCOUNT_ID,
      expect.any(String)
    );
  });
});

describe('check-readiness — calcul à la volée', () => {
  it('calcule, enregistre et renvoie les cinq champs du contrat', async () => {
    const result = (await checkReadiness({ issueKey: ISSUE_KEY }, CONTEXT)) as Record<
      string,
      unknown
    >;

    expect(Object.keys(result).sort()).toEqual([
      'advice',
      'gaps',
      'issueKey',
      'ready',
      'score',
      'status',
    ]);
    expect(result.issueKey).toBe(ISSUE_KEY);
    expect(typeof result.score).toBe('number');
    expect(['prêt', 'à préciser', 'non prêt']).toContain(result.status);
    expect(typeof result.ready).toBe('boolean');
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(typeof result.advice).toBe('string');
    expect(storageDoubles.saveReadiness).toHaveBeenCalledTimes(1);
    expect(storageDoubles.saveReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ issueKey: ISSUE_KEY }),
      expect.any(String)
    );
  });

  it('score un ticket complet comme prêt', async () => {
    collectDoubles.collectIssue.mockResolvedValue(
      makeIssue({
        components: ['paiements'],
        links: [],
        comments: [],
        customFields: {},
      })
    );
    collectDoubles.collectDecisions.mockResolvedValue([
      makeDecision('ADR-12 : pas de migration destructive', '2026-09-14'),
    ]);
    storageDoubles.loadAttempts.mockResolvedValue([]);

    const result = (await checkReadiness({ issueKey: ISSUE_KEY }, CONTEXT)) as { score: number };

    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('signale les manques au lieu de rendre un score muet', async () => {
    collectDoubles.collectIssue.mockResolvedValue(
      makeIssue({ description: '', acceptanceCriteria: [], components: [] })
    );
    storageDoubles.loadAttempts.mockResolvedValue([makeAttempt({ status: 'abandonné' })]);

    const result = (await checkReadiness({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      score: number;
      ready: boolean;
      gaps: Array<{ criterion: string; pointsLost: number; reason: string }>;
      advice: string;
    };

    expect(result.ready).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps[0].reason.length).toBeGreaterThan(0);
    expect(result.advice.length).toBeGreaterThan(0);
  });

  it('répond quand même si l’enregistrement du score échoue', async () => {
    storageDoubles.saveReadiness.mockRejectedValue(new Error('base indisponible'));

    const result = (await checkReadiness({ issueKey: ISSUE_KEY }, CONTEXT)) as { score: number };

    expect(typeof result.score).toBe('number');
  });
});

describe('check-readiness — droits', () => {
  it('refuse sans calculer quand l’accès est refusé', async () => {
    guardDoubles.assertIssueAccessFromContext.mockRejectedValue(
      new PermissionDeniedError(ISSUE_KEY)
    );

    const failure = asFailure(await checkReadiness({ issueKey: ISSUE_KEY }, CONTEXT));

    expect(failure.code).toBe('PERMISSION_DENIED');
    expect(collectDoubles.collectIssue).not.toHaveBeenCalled();
    expect(storageDoubles.saveReadiness).not.toHaveBeenCalled();
  });
});
