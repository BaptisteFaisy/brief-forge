/**
 * Schéma SQL de brief-forge (modèle § 14).
 *
 * Les instructions DDL vivent dans `src/storage/ddl.ts` (module sans
 * dépendance) pour que `src/storage/sqlClient.ts` puisse créer le schéma au
 * premier usage sans cycle d'imports. Ce module garde l'API publique
 * (`TABLES`, `SCHEMA_STATEMENTS`, `ensureSchema`) et la fonction de création
 * explicite.
 *
 * Contraintes Forge SQL respectées :
 *  - aucune clé étrangère (intégrité gérée par le code) ;
 *  - DDL **idempotent** : `CREATE TABLE IF NOT EXISTS`, index déclarés en ligne
 *    dans la table (Forge SQL n'a pas de `CREATE INDEX IF NOT EXISTS`) ;
 *  - pas d'`AUTO_INCREMENT` : les clés sont des UUID `VARCHAR(36)` générés
 *    côté application ;
 *  - une seule instruction par appel.
 *
 * Les huit tables : `brief`, `readiness`, `attempt`, `review`, `lesson`,
 * `claim`, `access_log`, `project_settings`.
 */

import { SqlClient, getSqlClient } from './sqlClient';
import { withDbError } from './helpers';
import { SCHEMA_STATEMENTS, TABLES } from './ddl';

export { SCHEMA_STATEMENTS, TABLES };
export type { TableName } from './ddl';

/**
 * Crée les tables manquantes (idempotent, appelable à chaque démarrage).
 * Une instruction par appel, conformément à Forge SQL.
 */
export async function ensureSchema(client: SqlClient = getSqlClient()): Promise<void> {
  await withDbError('ensureSchema', async () => {
    for (const statement of SCHEMA_STATEMENTS) {
      await client.executeDdl(statement.trim());
    }
  });
}
