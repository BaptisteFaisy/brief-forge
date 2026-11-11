/**
 * Faux client SQL en mémoire pour les tests de la couche stockage.
 *
 * Il n'interprète que les formes de requêtes réellement produites par les
 * repos (INSERT ... ON DUPLICATE KEY UPDATE, SELECT ... WHERE/ORDER BY/LIMIT,
 * UPDATE ... SET, DELETE ... WHERE) et le DDL `CREATE TABLE IF NOT EXISTS`.
 * Aucun accès réseau, aucun runtime Forge.
 */

import { SqlClient, SqlParam } from '../../src/storage/sqlClient';

type Row = Record<string, SqlParam>;

/** Clés primaires connues du faux moteur (une par table). */
export const PRIMARY_KEYS: Record<string, string[]> = {
  brief: ['issue_key', 'budget'],
  readiness: ['issue_key'],
  attempt: ['id'],
  review: ['id'],
  lesson: ['id'],
  claim: ['issue_key'],
  access_log: ['id'],
  project_settings: ['project_key'],
};

interface WhereTerm {
  column: string;
  op: '=' | '<' | '>';
}

const INSERT_RE = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]*)\)( ON DUPLICATE KEY UPDATE (.+))?$/;
const SELECT_RE =
  /^SELECT \* FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (\w+) (ASC|DESC))?(?: LIMIT (\?|\d+))?$/;
const UPDATE_RE = /^UPDATE (\w+) SET (.+?) WHERE (.+)$/;
const DELETE_RE = /^DELETE FROM (\w+) WHERE (.+)$/;
const DDL_RE = /^CREATE TABLE IF NOT EXISTS (\w+)/;

function splitWhere(clause: string): WhereTerm[] {
  return clause.split(' AND ').map((term) => {
    const match = /^(\w+) (=|<|>) \?$/.exec(term.trim());
    if (!match) throw new Error(`faux SQL : terme WHERE non géré « ${term} »`);
    return { column: match[1], op: match[2] as WhereTerm['op'] };
  });
}

function compare(left: SqlParam, right: SqlParam): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function matches(row: Row, terms: WhereTerm[], params: SqlParam[]): boolean {
  return terms.every((term, index) => {
    const expected = params[index];
    const actual = row[term.column];
    if (term.op === '=') return String(actual) === String(expected);
    const diff = compare(actual, expected);
    return term.op === '<' ? diff < 0 : diff > 0;
  });
}

function keyOf(table: string, row: Row): string {
  const keys = PRIMARY_KEYS[table] ?? [];
  return keys.map((key) => String(row[key])).join('|');
}

/** Client SQL en mémoire, inspectable par les tests. */
export class FakeSqlClient implements SqlClient {
  private readonly data = new Map<string, Row[]>();
  private readonly created = new Set<string>();
  /** Journal des instructions reçues : (sql, params). */
  readonly calls: Array<{ sql: string; params: SqlParam[] }> = [];

  /** Lignes stockées pour une table (copie défensive). */
  rowsOf(table: string): Row[] {
    return (this.data.get(table) ?? []).map((row) => ({ ...row }));
  }

  /** Tables créées par le DDL. */
  createdTables(): string[] {
    return [...this.created];
  }

  async query<RowType>(sql: string, params: SqlParam[] = []): Promise<RowType[]> {
    this.calls.push({ sql, params });
    const match = SELECT_RE.exec(sql.trim());
    if (!match) throw new Error(`faux SQL : SELECT non géré « ${sql} »`);
    const [, table, where, orderColumn, direction, limit] = match;
    let rows = (this.data.get(table) ?? []).map((row) => ({ ...row }));
    if (where) rows = rows.filter((row) => matches(row, splitWhere(where), params));
    if (orderColumn) {
      const sign = direction === 'DESC' ? -1 : 1;
      rows.sort((a, b) => sign * compare(a[orderColumn], b[orderColumn]));
    }
    if (limit) {
      const max = limit === '?' ? Number(params[params.length - 1]) : Number(limit);
      rows = rows.slice(0, max);
    }
    return rows as RowType[];
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<void> {
    this.calls.push({ sql, params });
    const trimmed = sql.trim();
    if (INSERT_RE.test(trimmed)) return this.applyInsert(trimmed, params);
    if (UPDATE_RE.test(trimmed)) return this.applyUpdate(trimmed, params);
    if (DELETE_RE.test(trimmed)) return this.applyDelete(trimmed, params);
    throw new Error(`faux SQL : instruction non gérée « ${sql} »`);
  }

  async executeDdl(sql: string): Promise<void> {
    this.calls.push({ sql, params: [] });
    const match = DDL_RE.exec(sql.trim());
    if (!match) throw new Error(`faux SQL : DDL non géré « ${sql} »`);
    this.created.add(match[1]);
    if (!this.data.has(match[1])) this.data.set(match[1], []);
  }

  private applyInsert(sql: string, params: SqlParam[]): void {
    const match = INSERT_RE.exec(sql);
    if (!match) throw new Error(`faux SQL : INSERT non géré « ${sql} »`);
    const [, table, columnsRaw, , , updates] = match;
    const columns = columnsRaw.split(',').map((column) => column.trim());
    const incoming: Row = {};
    columns.forEach((column, index) => {
      incoming[column] = params[index];
    });
    const rows = this.data.get(table) ?? [];
    const keys = PRIMARY_KEYS[table] ?? [];
    const existing = rows.find((row) => keyOf(table, row) === keyOf(table, incoming));
    if (existing && updates) {
      for (const assignment of updates.split(',')) {
        const column = assignment.split('=')[0].trim();
        if (!keys.includes(column)) existing[column] = incoming[column];
      }
    } else if (existing) {
      Object.assign(existing, incoming);
    } else {
      rows.push(incoming);
    }
    this.data.set(table, rows);
  }

  private applyUpdate(sql: string, params: SqlParam[]): void {
    const match = UPDATE_RE.exec(sql);
    if (!match) throw new Error(`faux SQL : UPDATE non géré « ${sql} »`);
    const [, table, setRaw, whereRaw] = match;
    const assignments = setRaw.split(',').map((part) => part.split('=')[0].trim());
    const terms = splitWhere(whereRaw);
    const whereParams = params.slice(assignments.length);
    for (const row of this.data.get(table) ?? []) {
      if (matches(row, terms, whereParams)) {
        assignments.forEach((column, index) => {
          row[column] = params[index];
        });
      }
    }
  }

  private applyDelete(sql: string, params: SqlParam[]): void {
    const match = DELETE_RE.exec(sql);
    if (!match) throw new Error(`faux SQL : DELETE non géré « ${sql} »`);
    const [, table, whereRaw] = match;
    const terms = splitWhere(whereRaw);
    const rows = this.data.get(table) ?? [];
    this.data.set(
      table,
      rows.filter((row) => !matches(row, terms, params))
    );
  }
}
