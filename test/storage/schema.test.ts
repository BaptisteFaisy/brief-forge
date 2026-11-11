/** Tests du schéma SQL : 8 tables, DDL idempotent, contraintes Forge SQL. */

import { FakeSqlClient } from './fakeSqlClient';
import { SCHEMA_STATEMENTS, TABLES, ensureSchema } from '../../src/storage/schema';
import { resetSqlClient, setSqlClient } from '../../src/storage/sqlClient';

const EXPECTED_TABLES = [
  'brief',
  'readiness',
  'attempt',
  'review',
  'lesson',
  'claim',
  'access_log',
  'project_settings',
];

describe('schéma SQL', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('déclare les huit tables du modèle', () => {
    expect(Object.values(TABLES).sort()).toEqual([...EXPECTED_TABLES].sort());
    expect(SCHEMA_STATEMENTS).toHaveLength(EXPECTED_TABLES.length);
  });

  it('crée toutes les tables, une instruction par appel', async () => {
    await ensureSchema();

    expect(fake.createdTables().sort()).toEqual([...EXPECTED_TABLES].sort());
    expect(fake.calls).toHaveLength(EXPECTED_TABLES.length);
  });

  it('est idempotent : chaque DDL porte IF NOT EXISTS', () => {
    for (const statement of SCHEMA_STATEMENTS) {
      expect(statement).toMatch(/CREATE TABLE IF NOT EXISTS \w+/);
    }
  });

  it('respecte les contraintes Forge SQL (pas de FK, pas d’AUTO_INCREMENT)', () => {
    const ddl = SCHEMA_STATEMENTS.join('\n').toUpperCase();
    expect(ddl).not.toContain('FOREIGN KEY');
    expect(ddl).not.toContain('REFERENCES');
    expect(ddl).not.toContain('AUTO_INCREMENT');
    expect(ddl).not.toContain('CREATE INDEX');
  });

  it('déclare une clé primaire sur chaque table', () => {
    for (const statement of SCHEMA_STATEMENTS) {
      expect(statement).toMatch(/PRIMARY KEY/);
    }
  });

  it('peut être rejoué sans erreur', async () => {
    await ensureSchema();
    await expect(ensureSchema()).resolves.toBeUndefined();
    expect(fake.calls).toHaveLength(EXPECTED_TABLES.length * 2);
  });

  it('traduit une erreur DDL en BriefError typée', async () => {
    setSqlClient({
      query: jest.fn(),
      execute: jest.fn(),
      executeDdl: jest.fn().mockRejectedValue(new Error('DDL refusé')),
    });

    await expect(ensureSchema()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
