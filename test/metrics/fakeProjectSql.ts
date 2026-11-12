/**
 * Faux client SQL pour les indicateurs de projet.
 *
 * Il n'interprète que la forme de requête émise par `src/metrics/queries.ts`
 * (`SELECT * FROM <table> WHERE issue_key LIKE ?`) et applique la sémantique
 * `LIKE` de MySQL : `%` = toute suite, `_` = un caractère, `\` = échappement.
 * Les lignes sont injectées par `seed` : aucun réseau, aucun runtime Forge,
 * aucune écriture attendue (les indicateurs sont en lecture seule).
 */

import { SqlClient, SqlParam } from '../../src/storage/sqlClient';

type Row = Record<string, SqlParam>;

const SELECT_LIKE = /^SELECT \* FROM (\w+) WHERE issue_key LIKE \?$/;

function escapeRegExpChar(char: string): string {
  return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/** Motif `LIKE` MySQL → expression rationnelle ancrée. */
export function likeToRegExp(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? '';
    if (char === '\\') {
      const next = pattern[index + 1];
      source += next ? escapeRegExpChar(next) : '\\\\';
      if (next) index += 1;
      continue;
    }
    if (char === '%') {
      source += '.*';
      continue;
    }
    if (char === '_') {
      source += '.';
      continue;
    }
    source += escapeRegExpChar(char);
  }
  return new RegExp(`^${source}$`);
}

/** Client SQL en mémoire limité aux lectures projet des indicateurs. */
export class FakeProjectSqlClient implements SqlClient {
  private readonly data = new Map<string, Row[]>();
  /** Journal des requêtes reçues. */
  readonly calls: Array<{ sql: string; params: SqlParam[] }> = [];

  /** Injecte les lignes d'une table. */
  seed(table: string, rows: Row[]): void {
    this.data.set(table, rows.map((row) => ({ ...row })));
  }

  /** Lignes stockées d'une table (copie défensive). */
  rowsOf(table: string): Row[] {
    return (this.data.get(table) ?? []).map((row) => ({ ...row }));
  }

  async query<RowType>(sql: string, params: SqlParam[] = []): Promise<RowType[]> {
    this.calls.push({ sql, params });
    const match = SELECT_LIKE.exec(sql.trim());
    if (!match) throw new Error(`faux SQL : SELECT non géré « ${sql} »`);
    const table = match[1] ?? '';
    const pattern = likeToRegExp(String(params[0] ?? ''));
    const rows = (this.data.get(table) ?? []).filter((row) =>
      pattern.test(String(row.issue_key ?? ''))
    );
    return rows as RowType[];
  }

  async execute(sql: string): Promise<void> {
    throw new Error(`faux SQL : aucune écriture attendue (« ${sql} »)`);
  }

  async executeDdl(sql: string): Promise<void> {
    throw new Error(`faux SQL : aucun DDL attendu (« ${sql} »)`);
  }
}
