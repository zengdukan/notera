import type { Migration, MigrationDatabase } from '../migrations/types';

interface TableInfoRow {
  readonly name: unknown;
  readonly type: unknown;
  readonly notnull: unknown;
}

function invalidMigration(): never {
  throw new Error('Invalid note version name migration.');
}

export const V3_NOTE_VERSION_NAME: Migration = Object.freeze({
  targetVersion: 3,
  migrate(database: MigrationDatabase) {
    database.exec(`
      ALTER TABLE note_versions
      ADD COLUMN version_name TEXT
      CHECK(
        version_name IS NULL
        OR (
          kind = 'USER'
          AND length(trim(version_name)) BETWEEN 1 AND 100
          AND version_name = trim(version_name)
        )
      );
    `);
  },
  validate(database: MigrationDatabase) {
    const columns = database
      .prepare<TableInfoRow>("PRAGMA table_info('note_versions')")
      .all()
      .filter(({ name }) => name === 'version_name');
    if (
      columns.length !== 1 ||
      columns[0].type !== 'TEXT' ||
      columns[0].notnull !== 0
    ) {
      invalidMigration();
    }
    const invalid = database
      .prepare(
        `SELECT 1 FROM note_versions WHERE version_name IS NOT NULL
         AND (kind <> 'USER' OR length(trim(version_name)) NOT BETWEEN 1 AND 100
              OR version_name <> trim(version_name)) LIMIT 1`,
      )
      .get();
    if (invalid !== undefined) invalidMigration();
  },
});
