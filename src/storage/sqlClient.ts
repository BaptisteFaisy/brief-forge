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
 *
 * **Le schéma est créé au premier usage.** Les tables sont créées par le DDL
 * idempotent de `src/storage/schema.ts`, appelé ici une seule fois par
 * instance, avant la première requête. Constaté sur un déploiement réel : le
 * schéma n'était créé par personne (la sonde de développement le faisait, et
 * elle n'est jamais mergée) ; en plus, désinstaller l'app efface les données
 * de l'app, donc les tables partent avec. Résultat : chaque requête échouait
 * sur « Unknown SQL execution error ». Le DDL étant idempotent
 * (`CREATE TABLE IF NOT EXISTS`), le créer à la demande est sûr et ne coûte
 * qu'une fois par conteneur.
 */

import { SCHEMA_STATEMENTS } from './ddl';

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

/**
 * Client qui garantit l'existence des tables avant la première requête.
 *
 * Le DDL est idempotent, donc le créer à la demande est sans risque ; la
 * promesse est mémorisée pour qu'une instance ne le fasse qu'une fois. En cas
 * d'échec, la mémorisation est **annulée** : l'erreur remonte à l'appelant,
 * et l'instance suivante réessaiera (une table manquante n'est pas un échec
 * définitif).
 */
export function createSchemaEnsuringClient(inner: SqlClient): SqlClient {
  let pending: Promise<void> | null = null;

  const ensure = (): Promise<void> => {
    if (!pending) {
      pending = (async () => {
        for (const statement of SCHEMA_STATEMENTS) {
          await inner.executeDdl(statement.trim());
        }
      })().catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  return {
    async query<Row>(sql: string, params: SqlParam[] = []): Promise<Row[]> {
      await ensure();
      return inner.query<Row>(sql, params);
    },
    async execute(sql: string, params: SqlParam[] = []): Promise<void> {
      await ensure();
      return inner.execute(sql, params);
    },
    async executeDdl(sql: string): Promise<void> {
      await ensure();
      return inner.executeDdl(sql);
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
    forgeClient = createSchemaEnsuringClient(createForgeSqlClient(loadForgeSql()));
  }
  return forgeClient;
}
