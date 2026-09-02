import type { Migration, MigrationDatabase } from '../migrations/types';

interface TableInfoRow {
  readonly name: unknown;
  readonly type: unknown;
  readonly notnull: unknown;
}

function invalidMigration(): never {
  throw new Error('Invalid trash display-name migration.');
}

export const V8_TRASH_DISPLAY_NAME: Migration = Object.freeze({
  targetVersion: 8,
  migrate(database: MigrationDatabase) {
    const orphan = database
      .prepare(
        `SELECT 1 FROM trash_entries entry
         LEFT JOIN notes note
           ON entry.object_type = 'NOTE' AND note.id = entry.object_id
          AND note.vault_id = entry.vault_id
         LEFT JOIN folders folder
           ON entry.object_type = 'FOLDER' AND folder.id = entry.object_id
          AND folder.vault_id = entry.vault_id
         WHERE (entry.object_type = 'NOTE' AND note.id IS NULL)
            OR (entry.object_type = 'FOLDER' AND folder.id IS NULL)
         LIMIT 1`,
      )
      .get();
    if (orphan !== undefined) invalidMigration();
    database.exec(`
      ALTER TABLE trash_entries
        ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
      UPDATE trash_entries
      SET display_name = CASE object_type
        WHEN 'NOTE' THEN (
          SELECT title FROM notes
          WHERE notes.id = trash_entries.object_id
            AND notes.vault_id = trash_entries.vault_id
        )
        WHEN 'FOLDER' THEN (
          SELECT name FROM folders
          WHERE folders.id = trash_entries.object_id
            AND folders.vault_id = trash_entries.vault_id
        )
      END;
    `);
  },
  validate(database: MigrationDatabase) {
    const columns = database
      .prepare<TableInfoRow>("PRAGMA table_info('trash_entries')")
      .all()
      .filter(({ name }) => name === 'display_name');
    if (
      columns.length !== 1 ||
      columns[0].type !== 'TEXT' ||
      columns[0].notnull !== 1
    ) {
      invalidMigration();
    }
    const invalid = database
      .prepare(
        `SELECT 1 FROM trash_entries
         WHERE typeof(display_name) <> 'text'
         LIMIT 1`,
      )
      .get();
    if (invalid !== undefined) invalidMigration();
  },
});
