/**
 * Point d'accès SQL unique de la couche stockage.
 *
 * Forge SQL s'utilise via `@forge/sql` (`sql.prepare(...).bindParams(...)`
 * puis `.execute()`, et `executeDDL` pour le DDL). On isole cette API derrière
 * l'interface minimale `SqlClient`, ce qui permet :
 *  - aux repos de ne dépendre que de `query`/`execute`/`executeDdl` ;
 *  - aux tests d'injecter un faux client (`setSqlClient`) sans runtime Forge
 *    ni réseau.
 *
 * L'import de `@forge/sql` est **paresseux** : aucun module n'est chargé tant
 * qu'un client réel n'est pas demandé, donc `jest` peut importer `src/storage`
 * hors runtime Forge.
 */

/** Paramètre lié à une requête (jamais interpolé dans le SQL). */
export type SqlParam = string | number | boolean | null;

/** Résultat minimal attendu d'une requête (forme `Result<T>` de Forge SQL). */
export interface SqlResult<Row> {
  rows?: Row[];
}

/** Instruction préparée renvoyée par `@forge/sql`. */
export interface ForgeSqlStatement {
  bindParams(...args: unknown[]): ForgeSqlStatement;
  execute(): Promise<SqlResult<unknown>>;
}

/** Sous-ensemble de l'API `@forge/sql` réellement utilisé. */
export interface ForgeSqlApi {
  prepare(query: string, endpoint?: string): ForgeSqlStatement;
  executeDDL?(query: string): Promise<SqlResult<unknown>>;
}

/** Interface minimale d'accès aux données, injectable dans les tests. */
export interface SqlClient {
  /** Exécute un SELECT et renvoie les lignes brutes. */
  query<Row>(sql: string, params?: SqlParam[]): Promise<Row[]>;
  /** Exécute un INSERT/UPDATE/DELETE paramétré. */
  execute(sql: string, params?: SqlParam[]): Promise<void>;
  /** Exécute une instruction DDL (idempotente, sans paramètres). */
  executeDdl(sql: string): Promise<void>;
}

const DDL_ENDPOINT = '/api/v1/execute/ddl';

/**
 * Adaptateur réel : traduit `SqlClient` en appels `@forge/sql`.
 * Aucune logique métier ici, seulement le passage de paramètres liés.
 */
export function createForgeSqlClient(forgeSql: ForgeSqlApi): SqlClient {
  async function run(sql: string, params: SqlParam[], endpoint?: string): Promise<SqlResult<unknown>> {
    const statement = forgeSql.prepare(sql, endpoint);
    if (params.length > 0) {
      statement.bindParams(...params);
    }
    return statement.execute();
  }

  return {
    async query<Row>(sql: string, params: SqlParam[] = []): Promise<Row[]> {
      const result = await run(sql, params);
      return (result.rows ?? []) as Row[];
    },
    async execute(sql: string, params: SqlParam[] = []): Promise<void> {
      await run(sql, params);
    },
    async executeDdl(sql: string): Promise<void> {
      if (typeof forgeSql.executeDDL === 'function') {
        await forgeSql.executeDDL(sql);
        return;
      }
      await run(sql, [], DDL_ENDPOINT);
    },
  };
}

/** Charge `@forge/sql` seulement au premier usage réel. */
function loadForgeSql(): ForgeSqlApi {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded = require('@forge/sql') as { default?: ForgeSqlApi } & ForgeSqlApi;
  return (loaded.default ?? loaded) as ForgeSqlApi;
}

let injected: SqlClient | null = null;
let forgeClient: SqlClient | null = null;

/** Injecte un client (tests, ou adaptateur alternatif). */
export function setSqlClient(client: SqlClient | null): void {
  injected = client;
}

/** Retire le client injecté et oublie le client Forge mémorisé. */
export function resetSqlClient(): void {
  injected = null;
  forgeClient = null;
}

/** Renvoie le client courant : injecté, sinon adaptateur `@forge/sql`. */
export function getSqlClient(): SqlClient {
  if (injected) return injected;
  if (!forgeClient) {
    forgeClient = createForgeSqlClient(loadForgeSql());
  }
  return forgeClient;
}
