/**
 * Tests de l'adaptateur SQL : traduction vers `@forge/sql` (mocké) et
 * injection d'un client. Aucun runtime Forge, aucun réseau.
 */

const prepare = jest.fn();
const executeDDL = jest.fn();

jest.mock('@forge/sql', () => ({
  prepare: (...args: unknown[]) => prepare(...args),
  executeDDL: (...args: unknown[]) => executeDDL(...args),
}));

import {
  ForgeSqlApi,
  createForgeSqlClient,
  getSqlClient,
  resetSqlClient,
  setSqlClient,
} from '../../src/storage/sqlClient';

function forgeStatement(rows: unknown[]) {
  const statement = {
    bindParams: jest.fn(),
    execute: jest.fn().mockResolvedValue({ rows }),
  };
  statement.bindParams.mockReturnValue(statement);
  return statement;
}

describe('adaptateur @forge/sql', () => {
  beforeEach(() => {
    prepare.mockReset();
    executeDDL.mockReset();
    resetSqlClient();
  });

  afterEach(() => resetSqlClient());

  it('passe les paramètres en requête liée et renvoie les lignes', async () => {
    const statement = forgeStatement([{ issue_key: 'PAY-142' }]);
    prepare.mockReturnValue(statement);

    const client = createForgeSqlClient({ prepare } as unknown as ForgeSqlApi);
    const rows = await client.query('SELECT * FROM brief WHERE issue_key = ?', ['PAY-142']);

    expect(prepare).toHaveBeenCalledWith('SELECT * FROM brief WHERE issue_key = ?', undefined);
    expect(statement.bindParams).toHaveBeenCalledWith('PAY-142');
    expect(rows).toEqual([{ issue_key: 'PAY-142' }]);
  });

  it('n’appelle pas bindParams sans paramètre', async () => {
    const statement = forgeStatement([]);
    prepare.mockReturnValue(statement);

    const client = createForgeSqlClient({ prepare } as unknown as ForgeSqlApi);
    await client.execute('DELETE FROM claim');

    expect(statement.bindParams).not.toHaveBeenCalled();
    expect(statement.execute).toHaveBeenCalledTimes(1);
  });

  it('renvoie un tableau vide si Forge ne fournit pas rows', async () => {
    const statement = { bindParams: jest.fn(), execute: jest.fn().mockResolvedValue({}) };
    prepare.mockReturnValue(statement);

    const client = createForgeSqlClient({ prepare } as unknown as ForgeSqlApi);
    expect(await client.query('SELECT * FROM lesson')).toEqual([]);
  });

  it('utilise executeDDL pour le schéma', async () => {
    executeDDL.mockResolvedValue({ rows: [] });

    const client = createForgeSqlClient({ prepare, executeDDL } as unknown as ForgeSqlApi);
    await client.executeDdl('CREATE TABLE IF NOT EXISTS brief (a INT)');

    expect(executeDDL).toHaveBeenCalledWith('CREATE TABLE IF NOT EXISTS brief (a INT)');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('replie le DDL sur l’endpoint dédié si executeDDL est absent', async () => {
    const statement = forgeStatement([]);
    prepare.mockReturnValue(statement);

    const client = createForgeSqlClient({ prepare } as unknown as ForgeSqlApi);
    await client.executeDdl('CREATE TABLE IF NOT EXISTS brief (a INT)');

    expect(prepare).toHaveBeenCalledWith('CREATE TABLE IF NOT EXISTS brief (a INT)', '/api/v1/execute/ddl');
  });

  it('utilise @forge/sql par défaut quand aucun client n’est injecté', async () => {
    const statement = forgeStatement([{ id: 'x' }]);
    prepare.mockReturnValue(statement);

    const rows = await getSqlClient().query('SELECT * FROM attempt WHERE id = ?', ['x']);
    expect(rows).toEqual([{ id: 'x' }]);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('privilégie le client injecté', async () => {
    const injected = {
      query: jest.fn().mockResolvedValue([{ id: 'injecté' }]),
      execute: jest.fn(),
      executeDdl: jest.fn(),
    };
    setSqlClient(injected);

    expect(await getSqlClient().query('SELECT 1')).toEqual([{ id: 'injecté' }]);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('reconstruit le client Forge après reset', async () => {
    prepare.mockReturnValue(forgeStatement([]));

    await getSqlClient().query('SELECT * FROM claim');
    resetSqlClient();
    await getSqlClient().query('SELECT * FROM claim');

    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
