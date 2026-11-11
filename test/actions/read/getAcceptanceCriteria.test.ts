/** Tests de l'outil `get-acceptance-criteria` : numérotation, sources, dates. */

import { getAcceptanceCriteria } from '../../../src/actions/getAcceptanceCriteria';
import {
  CONTEXT,
  ISSUE_KEY,
  asFailure,
  collectDoubles,
  makeIssue,
  makeSettings,
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

describe('get-acceptance-criteria — validation des entrées', () => {
  it('refuse un appel sans issueKey', async () => {
    const failure = asFailure(await getAcceptanceCriteria({}, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.error).toContain('issueKey');
    expect(collectDoubles.collectIssue).not.toHaveBeenCalled();
  });

  it('refuse une clé de ticket mal formée', async () => {
    const failure = asFailure(await getAcceptanceCriteria({ issueKey: 'PAY' }, CONTEXT));

    expect(failure.code).toBe('INVALID_INPUT');
  });
});

describe('get-acceptance-criteria — contenu', () => {
  it('numérote les critères du ticket à partir de 1, avec source et date', async () => {
    const issue = makeIssue();
    collectDoubles.collectIssue.mockResolvedValue(issue);

    const result = (await getAcceptanceCriteria({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      issueKey: string;
      criteria: Array<{ index: number; text: string; source: string; date: string }>;
    };

    expect(result.issueKey).toBe(ISSUE_KEY);
    expect(result.criteria).toHaveLength(issue.acceptanceCriteria.length);
    expect(result.criteria[0]).toEqual({
      index: 1,
      text: issue.acceptanceCriteria[0],
      source: `Jira ${ISSUE_KEY}`,
      date: issue.updatedAt,
    });
    expect(result.criteria[1].index).toBe(2);
  });

  it('privilégie le champ personnalisé défini par le projet', async () => {
    collectDoubles.collectIssue.mockResolvedValue(
      makeIssue({ customFields: { customfield_42: 'Critère A\nCritère B\nCritère C' } })
    );
    collectDoubles.collectProjectSettings.mockResolvedValue(
      makeSettings({ acceptanceCriteriaField: 'customfield_42' })
    );

    const result = (await getAcceptanceCriteria({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      criteria: Array<{ index: number; text: string }>;
    };

    expect(result.criteria.map((criterion) => criterion.text)).toEqual([
      'Critère A',
      'Critère B',
      'Critère C',
    ]);
  });

  it('renvoie une liste vide quand le ticket n’a aucun critère', async () => {
    collectDoubles.collectIssue.mockResolvedValue(makeIssue({ acceptanceCriteria: [] }));

    const result = (await getAcceptanceCriteria({ issueKey: ISSUE_KEY }, CONTEXT)) as {
      criteria: unknown[];
    };

    expect(result.criteria).toEqual([]);
  });

  it('lit les réglages du projet du ticket, pas une entrée d’outil', async () => {
    await getAcceptanceCriteria({ issueKey: ISSUE_KEY, projectKey: 'AUTRE' }, CONTEXT);

    expect(collectDoubles.collectProjectSettings).toHaveBeenCalledWith('PAY');
  });
});
