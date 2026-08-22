import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';
import { validateMigrationRegistry } from './registry';
import type { Migration } from './types';

interface VersionRow {
  readonly schema_version: unknown;
}

function failMigration(): never {
  throw new StorageError('MIGRATION_FAILED');
}

export function runMigrations(
  database: SqlcipherConnection,
  fromVersion: number,
  targetVersion: number,
  migrations: readonly Migration[],
): void {
  const validated = validateMigrationRegistry(
    migrations,
    fromVersion,
    targetVersion,
  );

  validated.forEach((migration) => {
    try {
      database.transaction(() => {
        const before = database
          .prepare<VersionRow>(
            'SELECT schema_version FROM schema_metadata WHERE singleton = 1',
          )
          .all();
        if (
          before.length !== 1 ||
          before[0].schema_version !== migration.targetVersion - 1
        ) {
          failMigration();
        }

        migration.migrate(database);
        migration.validate(database);
        const result = database
          .prepare(
            `UPDATE schema_metadata SET schema_version = ?
             WHERE singleton = 1`,
          )
          .run(migration.targetVersion);
        if (result.changes !== 1) {
          failMigration();
        }
      })();
    } catch {
      failMigration();
    }
  });
}
