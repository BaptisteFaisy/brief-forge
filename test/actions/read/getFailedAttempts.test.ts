/** Tests de l'outil `get-failed-attempts` : filtre, ordre, résumé et raison. */

import { getFailedAttempts } from '../../../src/actions/getFailedAttempts';
import {
  CONTEXT,
  ISSUE_KEY,
  asFailure,
  makeAttempt,
  primeDoubles,
  resetDoubles,
  storageDoubles,
} from './doubles';

jest.mock('../../../src/security/permissionGuard', () => require('./doubles').guardDoubles);
jest.mock('../../../src/storage', () => require('./doubles').storageDoubles);
jest.mock('../../../src/brief', () => require('./doubles').briefDoubles);

beforeEach(() => {
  resetDoubles();
  primeDoubles();
});

describe('get-failed-attempts — validation des entrées', () => {
  it('refuse un appel sans issueKey', async () => {
    const failure = asFailure(await getFailedAttempts({}, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.error).toContain('issueKey');
    expect(storageDoubles.loadAttempts).not.toHaveBeenCalled();
  });

  it('refuse une clé de ticket mal formée', async () => {
    const failure = asFailure(await getFailedAttempts({ issueKey: 'PAY 142' }, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
  });
});

describe('get-failed-attempts — contenu', () => {
  it('ne garde que les tentatives échouées, la plus récente d’abord', async () => {
    storageDoubles.loadAttempts.mockResolvedValue([
      makeAttempt({ id: 'a1', startedAt: '2026-11-01T08:00:00.000Z', status: 'bloqué' }),
      makeAttempt({ id: 'a2', startedAt: '2026-11-05T08:00:00.000Z', status: 'terminé' }),
      makeAttempt({ id: 'a3', startedAt: '2026-11-03T08:00:00.000Z', status: 'abandonné' }),
    ]);

    const result = (await getFailedAttempts({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      issueKey: string;
      attempts: Array<{ date: string; status: string }>;
    };

    expect(result.issueKey).toBe(ISSUE_KEY);
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['abandonné', 'bloqué']);
    expect(result.attempts[0].date).toBe('2026-11-03T08:00:00.000Z');
  });

  it('extrait la raison déclarée et un résumé lisible', async () => {
    storageDoubles.loadAttempts.mockResolvedValue([
      makeAttempt({
        reportMd: '## Fait\nAjout d’une clé d’idempotence.\n\n## Raison : le schéma ne permet pas d’index unique.',
        agentName: 'claude-code',
      }),
    ]);

    const result = (await getFailedAttempts({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      attempts: Array<{
        date: string;
        agentName: string;
        status: string;
        summary: string;
        reason: string;
      }>;
    };

    expect(result.attempts[0]).toEqual({
      date: expect.any(String),
      agentName: 'claude-code',
      status: 'bloqué',
      summary: expect.stringContaining('clé d’idempotence'),
      reason: 'le schéma ne permet pas d’index unique.',
    });
    expect(result.attempts[0].summary).not.toContain('Raison');
  });

  it('laisse la raison vide quand le compte rendu n’en donne pas', async () => {
    storageDoubles.loadAttempts.mockResolvedValue([
      makeAttempt({ reportMd: 'Tentative interrompue par un quota épuisé.' }),
    ]);

    const result = (await getFailedAttempts({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      attempts: Array<{ reason: string; summary: string }>;
    };

    expect(result.attempts[0].reason).toBe('');
    expect(result.attempts[0].summary).toContain('quota épuisé');
  });

  it('renvoie une liste vide quand aucune tentative n’existe', async () => {
    storageDoubles.loadAttempts.mockResolvedValue([]);

    const result = (await getFailedAttempts({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      attempts: unknown[];
    };

    expect(result.attempts).toEqual([]);
  });
});
