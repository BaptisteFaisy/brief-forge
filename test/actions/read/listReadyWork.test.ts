/** Tests de l'outil `list-ready-work` : seuil, tri, validation du projet. */

import { listReadyWork } from '../../../src/actions/listReadyWork';
import {
  CONTEXT,
  PROJECT_KEY,
  asFailure,
  primeDoubles,
  resetDoubles,
  storageDoubles,
} from './doubles';

jest.mock('../../../src/security/permissionGuard', () => require('./doubles').guardDoubles);
jest.mock('../../../src/storage', () => require('./doubles').storageDoubles);

const query = jest.fn();

beforeEach(() => {
  resetDoubles();
  primeDoubles();
  query.mockReset();
  storageDoubles.getSqlClient.mockReturnValue({ query });
});

describe('list-ready-work — validation des entrées', () => {
  it('refuse un appel sans projectKey', async () => {
    const failure = asFailure(await listReadyWork({}, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.error).toContain('projectKey');
    expect(query).not.toHaveBeenCalled();
  });

  it('refuse une clé de projet contenant un numéro de ticket', async () => {
    const failure = asFailure(await listReadyWork({ projectKey: 'PAY-142' }, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('list-ready-work — contenu', () => {
  it('ne garde que les tickets au seuil « prêt », le meilleur d’abord', async () => {
    query.mockResolvedValue([
      { issue_key: 'PAY-142', score: 82, status: 'prêt' },
      { issue_key: 'PAY-143', score: 65, status: 'à préciser' },
      { issue_key: 'PAY-144', score: 91, status: 'prêt' },
      { issue_key: 'PAY-145', score: 70, status: 'prêt' },
    ]);

    const result = (await listReadyWork({ projectKey: PROJECT_KEY }, CONTEXT)) as {
      projectKey: string;
      tickets: Array<{ issueKey: string; score: number; status: string }>;
    };

    expect(result.projectKey).toBe(PROJECT_KEY);
    expect(result.tickets).toEqual([
      { issueKey: 'PAY-144', score: 91, status: 'prêt' },
      { issueKey: 'PAY-142', score: 82, status: 'prêt' },
      { issueKey: 'PAY-145', score: 70, status: 'prêt' },
    ]);
  });

  it('interroge uniquement les scores du projet demandé', async () => {
    query.mockResolvedValue([]);

    await listReadyWork({ projectKey: 'ops' }, CONTEXT);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('readiness'), ['OPS-%']);
  });

  it('renvoie une liste vide quand aucun ticket n’est prêt', async () => {
    query.mockResolvedValue([{ issue_key: 'PAY-143', score: 12, status: 'non prêt' }]);

    const result = (await listReadyWork({ projectKey: PROJECT_KEY }, CONTEXT)) as {
      tickets: unknown[];
    };

    expect(result.tickets).toEqual([]);
  });

  it('ignore les lignes sans clé de ticket', async () => {
    query.mockResolvedValue([{ score: 90, status: 'prêt' }]);

    const result = (await listReadyWork({ projectKey: PROJECT_KEY }, CONTEXT)) as {
      tickets: unknown[];
    };

    expect(result.tickets).toEqual([]);
  });
});
