/**
 * Régression du 13 novembre 2026 — le schéma SQL n'existait pas.
 *
 * Constat réel, en production : aucune table n'avait jamais été créée. Le
 * DDL idempotent (`ensureSchema`) n'était appelé que par la sonde de
 * développement — branche jamais mergée. Et comme désinstaller l'app efface
 * les données de l'app, les tables disparaissaient avec l'installation. Chaque
 * requête échouait alors sur « Unknown SQL execution error ».
 *
 * Le client crée donc le schéma au premier usage, une fois par instance.
 */
import { createSchemaEnsuringClient, SqlClient } from '../../src/storage/sqlClient';
import { SCHEMA_STATEMENTS } from '../../src/storage/ddl';

function fauxClient() {
  const executeDdl = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn().mockResolvedValue([]);
  const execute = jest.fn().mockResolvedValue(undefined);
  return {
    client: { query, execute, executeDdl } as unknown as SqlClient,
    query,
    execute,
    executeDdl,
  };
}

describe('client SQL — le schéma est créé au premier usage', () => {
  it('exécute le DDL complet avant la première requête', async () => {
    const faux = fauxClient();
    const client = createSchemaEnsuringClient(faux.client);

    await client.query('SELECT 1');

    expect(faux.executeDdl).toHaveBeenCalledTimes(SCHEMA_STATEMENTS.length);
    for (const statement of SCHEMA_STATEMENTS) {
      expect(faux.executeDdl).toHaveBeenCalledWith(statement.trim());
    }
    expect(faux.query).toHaveBeenCalledTimes(1);
  });

  it('ne recrée pas le schéma à chaque requête (une seule fois par instance)', async () => {
    const faux = fauxClient();
    const client = createSchemaEnsuringClient(faux.client);

    await client.query('SELECT 1');
    await client.query('SELECT 2');
    await client.execute('DELETE FROM claim');

    expect(faux.executeDdl).toHaveBeenCalledTimes(SCHEMA_STATEMENTS.length);
    expect(faux.query).toHaveBeenCalledTimes(2);
    expect(faux.execute).toHaveBeenCalledTimes(1);
  });

  it('remonte l’erreur de création et permet une tentative suivante', async () => {
    const faux = fauxClient();
    faux.executeDdl.mockRejectedValueOnce(new Error('DDL refusé'));
    const client = createSchemaEnsuringClient(faux.client);

    await expect(client.query('SELECT 1')).rejects.toThrow('DDL refusé');
    // La mémorisation a été annulée : l'instance suivante réessaie.
    await client.query('SELECT 1');
    expect(faux.executeDdl).toHaveBeenCalledTimes(SCHEMA_STATEMENTS.length + 1);
  });
});
