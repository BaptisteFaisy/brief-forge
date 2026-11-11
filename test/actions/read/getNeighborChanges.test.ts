/** Tests de l'outil `get-neighbor-changes` : forme, ordre, collecte ciblée. */

import { getNeighborChanges } from '../../../src/actions/getNeighborChanges';
import {
  CONTEXT,
  ISSUE_KEY,
  asFailure,
  collectDoubles,
  makeChange,
  makeIssue,
  primeDoubles,
  resetDoubles,
} from './doubles';

jest.mock('../../../src/security/permissionGuard', () => require('./doubles').guardDoubles);
jest.mock('../../../src/collect/issueCollector', () => require('./doubles').collectDoubles);
jest.mock('../../../src/storage', () => require('./doubles').storageDoubles);
jest.mock('../../../src/brief', () => require('./doubles').briefDoubles);

beforeEach(() => {
  resetDoubles();
  primeDoubles();
});

describe('get-neighbor-changes — validation des entrées', () => {
  it('refuse un appel sans issueKey', async () => {
    const failure = asFailure(await getNeighborChanges({}, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.error).toContain('issueKey');
    expect(collectDoubles.collectIssue).not.toHaveBeenCalled();
  });

  it('refuse une clé de ticket mal formée', async () => {
    const failure = asFailure(await getNeighborChanges({ issueKey: 'PAY-142-extra' }, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
  });
});

describe('get-neighbor-changes — contenu', () => {
  it('renvoie les changements du plus récent au plus ancien, avec leur état', async () => {
    collectDoubles.collectNeighborChanges.mockResolvedValue([
      makeChange({
        kind: 'commit',
        title: 'fix(paiements): verrou sur la clé client',
        url: 'https://bitbucket.org/x/commits/aaa',
        date: '2026-10-01T09:00:00.000Z',
        author: 'mdupont',
        state: undefined,
      }),
      makeChange({
        kind: 'pull-request',
        title: 'refactor(paiements): extraire le service de remboursement',
        date: '2026-10-20T12:00:00.000Z',
        state: 'merged',
      }),
    ]);

    const result = (await getNeighborChanges({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      issueKey: string;
      changes: Array<{
        kind: string;
        title: string;
        url: string;
        date: string;
        author: string;
        state: string;
      }>;
    };

    expect(result.issueKey).toBe(ISSUE_KEY);
    expect(result.changes.map((change) => change.kind)).toEqual(['pull-request', 'commit']);
    expect(result.changes[0]).toEqual({
      kind: 'pull-request',
      title: 'refactor(paiements): extraire le service de remboursement',
      url: 'https://bitbucket.org/x/pr/12',
      date: '2026-10-20T12:00:00.000Z',
      author: 'mdupont',
      state: 'merged',
    });
    expect(result.changes[1].state).toBe('');
  });

  it('collecte les voisins à partir du ticket lu, jamais d’une entrée d’outil', async () => {
    const issue = makeIssue();
    collectDoubles.collectIssue.mockResolvedValue(issue);

    await getNeighborChanges({ issueKey: ISSUE_KEY, components: ['autre'] }, CONTEXT);

    expect(collectDoubles.collectNeighborChanges).toHaveBeenCalledWith(issue);
  });

  it('renvoie une liste vide quand aucun changement voisin n’est détecté', async () => {
    collectDoubles.collectNeighborChanges.mockResolvedValue([]);

    const result = (await getNeighborChanges({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      changes: unknown[];
    };

    expect(result.changes).toEqual([]);
  });
});
