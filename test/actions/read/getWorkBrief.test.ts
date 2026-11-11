/** Tests de l'outil `get-work-brief` : validation, cache, reconstruction. */

import { getWorkBrief } from '../../../src/actions/getWorkBrief';
import { PermissionDeniedError } from '../../../src/util/errors';
import {
  ACCOUNT_ID,
  CONTEXT,
  ISSUE_KEY,
  asFailure,
  briefDoubles,
  guardDoubles,
  makeBrief,
  makeStoredBrief,
  primeDoubles,
  resetDoubles,
  storageDoubles,
} from './doubles';

jest.mock('../../../src/security/permissionGuard', () => require('./doubles').guardDoubles);
jest.mock('../../../src/brief', () => require('./doubles').briefDoubles);
jest.mock('../../../src/storage', () => require('./doubles').storageDoubles);

beforeEach(() => {
  resetDoubles();
  primeDoubles();
});

describe('get-work-brief — validation des entrées', () => {
  it('refuse un appel sans issueKey', async () => {
    const failure = asFailure(await getWorkBrief({}, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.error).toContain('issueKey');
    expect(briefDoubles.buildBrief).not.toHaveBeenCalled();
    expect(guardDoubles.assertIssueAccessFromContext).not.toHaveBeenCalled();
  });

  it('refuse une clé de ticket mal formée', async () => {
    const failure = asFailure(await getWorkBrief({ issueKey: '../../etc/passwd' }, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(guardDoubles.assertIssueAccessFromContext).not.toHaveBeenCalled();
  });

  it('refuse un budget inconnu', async () => {
    const failure = asFailure(await getWorkBrief({ issueKey: ISSUE_KEY, budget: 'xl' }, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.error).toContain('Budget invalide');
    expect(storageDoubles.loadBrief).not.toHaveBeenCalled();
  });
});

describe('get-work-brief — brief précalculé', () => {
  it('sert le brief stocké sans le reconstruire', async () => {
    const brief = makeBrief('m');
    storageDoubles.loadBrief.mockResolvedValue(makeStoredBrief(brief));

    const result = await getWorkBrief({ issueKey: ISSUE_KEY }, CONTEXT);

    expect(result).toMatchObject({ issueKey: ISSUE_KEY, budget: 'm', markdown: brief.markdown });
    expect((result as { data: { objective: string } }).data.objective).toBe(brief.objective);
    expect(briefDoubles.buildBrief).not.toHaveBeenCalled();
    expect(storageDoubles.loadBrief).toHaveBeenCalledWith(ISSUE_KEY, 'm');
  });

  it('journalise l’appel avec l’identité du contexte', async () => {
    storageDoubles.loadBrief.mockResolvedValue(makeStoredBrief());

    await getWorkBrief({ issueKey: ISSUE_KEY }, CONTEXT);

    expect(storageDoubles.logAccess).toHaveBeenCalledWith(
      ISSUE_KEY,
      'get-work-brief',
      ACCOUNT_ID,
      expect.any(String)
    );
  });

  it('reconstruit et réenregistre un brief périmé', async () => {
    storageDoubles.loadBrief.mockResolvedValue(makeStoredBrief(makeBrief('m'), { stale: true }));
    briefDoubles.buildBrief.mockResolvedValue(makeBrief('m'));

    const result = await getWorkBrief({ issueKey: ISSUE_KEY, budget: 'm' }, CONTEXT);

    expect(briefDoubles.buildBrief).toHaveBeenCalledWith(ISSUE_KEY, 'm');
    expect(storageDoubles.saveBrief).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ issueKey: ISSUE_KEY, budget: 'm' });
  });
});

describe('get-work-brief — construction à la volée', () => {
  it('construit le brief demandé quand aucun n’est stocké', async () => {
    briefDoubles.buildBrief.mockResolvedValue(makeBrief('l'));

    const result = await getWorkBrief({ issueKey: ISSUE_KEY, budget: 'l' }, CONTEXT);

    expect(briefDoubles.buildBrief).toHaveBeenCalledWith(ISSUE_KEY, 'l');
    expect(result).toMatchObject({ issueKey: ISSUE_KEY, budget: 'l', markdown: expect.any(String) });
    expect(storageDoubles.saveBrief).toHaveBeenCalledWith(
      expect.objectContaining({ issueKey: ISSUE_KEY, budget: 'l' }),
      expect.any(String)
    );
  });

  it('répond quand même si l’enregistrement échoue', async () => {
    briefDoubles.buildBrief.mockResolvedValue(makeBrief('m'));
    storageDoubles.saveBrief.mockRejectedValue(new Error('base indisponible'));

    const result = await getWorkBrief({ issueKey: ISSUE_KEY }, CONTEXT);

    expect(result).toMatchObject({ issueKey: ISSUE_KEY, budget: 'm', markdown: expect.any(String) });
  });
});

describe('get-work-brief — garde de temps', () => {
  it('se replie sur le budget s quand la construction dépasse 40 s', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    briefDoubles.buildBrief.mockImplementation((_key: string, budget: string) =>
      budget === 's' ? Promise.resolve(makeBrief('s')) : new Promise(() => undefined)
    );

    const pending = getWorkBrief({ issueKey: ISSUE_KEY, budget: 'l' }, CONTEXT);
    await jest.advanceTimersByTimeAsync(40_000);
    const result = (await pending) as { budget: string; markdown: string };

    expect(result.budget).toBe('s');
    expect(briefDoubles.buildBrief).toHaveBeenLastCalledWith(ISSUE_KEY, 's');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('repli sur le budget s'));

    warn.mockRestore();
    jest.useRealTimers();
  });
});

describe('get-work-brief — droits et pannes', () => {
  it('refuse sans rien lire quand l’accès au ticket est refusé', async () => {
    guardDoubles.assertIssueAccessFromContext.mockRejectedValue(
      new PermissionDeniedError(ISSUE_KEY)
    );

    const failure = asFailure(await getWorkBrief({ issueKey: ISSUE_KEY }, CONTEXT));

    expect(failure.code).toBe('PERMISSION_DENIED');
    expect(storageDoubles.loadBrief).not.toHaveBeenCalled();
    expect(storageDoubles.logAccess).not.toHaveBeenCalled();
  });

  it('remonte une erreur de construction sans la maquiller en brief vide', async () => {
    briefDoubles.buildBrief.mockRejectedValue(new Error('Jira injoignable'));

    const failure = asFailure(await getWorkBrief({ issueKey: ISSUE_KEY }, CONTEXT));

    expect(failure.code).toBe('INTERNAL_ERROR');
    expect(failure.error).toContain('Jira injoignable');
    expect(storageDoubles.saveBrief).not.toHaveBeenCalled();
  });
});
