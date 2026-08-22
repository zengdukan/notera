import type { Migration, MigrationDatabase } from '../migrations/types';

interface TableInfoRow {
  readonly name: unknown;
  readonly type: unknown;
  readonly notnull: unknown;
}

interface PendingDigestCountRow {
  readonly count: unknown;
}

function invalidMigration(): never {
  throw new Error('Invalid pending vault metadata digest migration.');
}

export const V2_PENDING_VAULT_META_DIGEST: Migration = Object.freeze({
  targetVersion: 2,
  migrate(database: MigrationDatabase) {
    database.exec(`
      ALTER TABLE vault_metadata
      ADD COLUMN pending_vault_meta_digest BLOB
      CHECK(
        pending_vault_meta_digest IS NULL
        OR length(pending_vault_meta_digest) = 32
      );
    `);
  },
  validate(database: MigrationDatabase) {
    const columns = database
      .prepare<TableInfoRow>("PRAGMA table_info('vault_metadata')")
      .all();
    const pendingColumns = columns.filter(
      ({ name }) => name === 'pending_vault_meta_digest',
    );
    if (
      pendingColumns.length !== 1 ||
      pendingColumns[0].type !== 'BLOB' ||
      pendingColumns[0].notnull !== 0
    ) {
      invalidMigration();
    }

    const row = database
      .prepare<PendingDigestCountRow>(
        `SELECT count(*) AS count FROM vault_metadata
         WHERE pending_vault_meta_digest IS NOT NULL`,
      )
      .get();
    if (row?.count !== 0) {
      invalidMigration();
    }
  },
});
