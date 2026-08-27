import type { Migration, MigrationDatabase } from '../migrations/types';

const UUID_GLOB =
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[1-8][0-9a-f][0-9a-f][0-9a-f]-' +
  '[89ab][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]';

const uuid = (column: string) =>
  `typeof(${column}) = 'text' AND ${column} GLOB '${UUID_GLOB}'`;

function invalidMigration(): never {
  throw new Error('Invalid upload attachment reference migration.');
}

export const V5_UPLOAD_ATTACHMENT_REFERENCES: Migration = Object.freeze({
  targetVersion: 5,
  migrate(database: MigrationDatabase) {
    database.exec(`
      CREATE TABLE attachment_references_v5(
        row_id INTEGER PRIMARY KEY,
        vault_id TEXT NOT NULL CHECK(${uuid('vault_id')}),
        attachment_id TEXT NOT NULL CHECK(${uuid('attachment_id')}),
        source_type TEXT NOT NULL CHECK(source_type IN (
          'NOTE', 'NOTE_VERSION', 'TRASH', 'UPLOAD'
        )),
        note_id TEXT CHECK(note_id IS NULL OR (${uuid('note_id')})),
        note_version_id TEXT
          CHECK(note_version_id IS NULL OR (${uuid('note_version_id')})),
        trash_entry_id TEXT
          CHECK(trash_entry_id IS NULL OR (${uuid('trash_entry_id')})),
        expires_at INTEGER CHECK(
          expires_at IS NULL OR
          (expires_at >= 0 AND expires_at <= 9007199254740991)
        ),
        CHECK(
          (note_id IS NOT NULL) +
          (note_version_id IS NOT NULL) +
          (trash_entry_id IS NOT NULL) = 1
        ),
        CHECK(
          (source_type = 'NOTE' AND note_id IS NOT NULL AND expires_at IS NULL)
          OR (source_type = 'NOTE_VERSION' AND note_version_id IS NOT NULL
              AND expires_at IS NULL)
          OR (source_type = 'TRASH' AND trash_entry_id IS NOT NULL
              AND expires_at IS NULL)
          OR (source_type = 'UPLOAD' AND note_id IS NOT NULL
              AND expires_at IS NOT NULL)
        )
      );

      INSERT INTO attachment_references_v5(
        row_id, vault_id, attachment_id, source_type,
        note_id, note_version_id, trash_entry_id, expires_at
      )
      SELECT row_id, vault_id, attachment_id, source_type,
             note_id, note_version_id, trash_entry_id, NULL
      FROM attachment_references;

      DROP INDEX attachment_references_note;
      DROP INDEX attachment_references_version;
      DROP INDEX attachment_references_trash;
      DROP INDEX attachment_references_attachment;
      DROP TABLE attachment_references;
      ALTER TABLE attachment_references_v5 RENAME TO attachment_references;

      CREATE UNIQUE INDEX attachment_references_note
        ON attachment_references(vault_id, attachment_id, note_id)
        WHERE source_type = 'NOTE';
      CREATE UNIQUE INDEX attachment_references_version
        ON attachment_references(vault_id, attachment_id, note_version_id)
        WHERE source_type = 'NOTE_VERSION';
      CREATE UNIQUE INDEX attachment_references_trash
        ON attachment_references(vault_id, attachment_id, trash_entry_id)
        WHERE source_type = 'TRASH';
      CREATE UNIQUE INDEX attachment_references_upload
        ON attachment_references(vault_id, attachment_id, note_id)
        WHERE source_type = 'UPLOAD';
      CREATE INDEX attachment_references_attachment
        ON attachment_references(vault_id, attachment_id);
      CREATE INDEX attachment_references_upload_expiry
        ON attachment_references(vault_id, expires_at, attachment_id)
        WHERE source_type = 'UPLOAD';
    `);
  },
  validate(database: MigrationDatabase) {
    const columns = database
      .prepare<{ name: unknown }>("PRAGMA table_info('attachment_references')")
      .all()
      .map(({ name }) =>
        typeof name === 'string' ? name : invalidMigration(),
      );
    if (
      columns.join(',') !==
      'row_id,vault_id,attachment_id,source_type,note_id,note_version_id,trash_entry_id,expires_at'
    ) {
      invalidMigration();
    }
    const invalid = database
      .prepare(
        `SELECT 1 FROM attachment_references
         WHERE source_type NOT IN ('NOTE', 'NOTE_VERSION', 'TRASH', 'UPLOAD')
            OR (source_type = 'UPLOAD' AND (note_id IS NULL OR expires_at IS NULL))
            OR (source_type <> 'UPLOAD' AND expires_at IS NOT NULL)
         LIMIT 1`,
      )
      .get();
    if (invalid !== undefined) invalidMigration();
  },
});
