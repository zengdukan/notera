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
  throw new Error('Invalid normalized attachment migration.');
}

function columns(
  database: MigrationDatabase,
  table: string,
): readonly string[] {
  return database
    .prepare<{ name: unknown }>(`PRAGMA table_info('${table}')`)
    .all()
    .map(({ name }) => (typeof name === 'string' ? name : invalidMigration()));
}

export const V4_NORMALIZED_ATTACHMENT_BLOBS: Migration = Object.freeze({
  targetVersion: 4,
  migrate(database: MigrationDatabase) {
    database.exec(`
      CREATE TABLE attachment_blobs(
        blob_id TEXT PRIMARY KEY CHECK(${uuid('blob_id')}),
        vault_id TEXT NOT NULL CHECK(${uuid('vault_id')}),
        content_sha256 BLOB CHECK(
          content_sha256 IS NULL OR length(content_sha256) = 32
        ),
        byte_length INTEGER NOT NULL
          CHECK(byte_length >= 0 AND byte_length <= 104857600),
        local_state TEXT NOT NULL CHECK(local_state IN (
          'IMPORTING', 'READY', 'MISSING', 'CORRUPT', 'GC_PENDING'
        )),
        file_key BLOB NOT NULL CHECK(length(file_key) = 32),
        manifest_version INTEGER NOT NULL
          CHECK(manifest_version >= 1 AND manifest_version <= 9007199254740991),
        manifest BLOB NOT NULL CHECK(length(manifest) <= 1048576),
        created_at INTEGER NOT NULL
          CHECK(created_at >= 0 AND created_at <= 9007199254740991),
        updated_at INTEGER NOT NULL
          CHECK(updated_at >= created_at AND updated_at <= 9007199254740991),
        UNIQUE(vault_id, blob_id)
      );

      CREATE TABLE attachments_v4(
        id TEXT PRIMARY KEY CHECK(${uuid('id')}),
        blob_id TEXT NOT NULL CHECK(${uuid('blob_id')}),
        vault_id TEXT NOT NULL CHECK(${uuid('vault_id')}),
        file_name TEXT NOT NULL CHECK(length(trim(file_name)) > 0),
        mime_type TEXT NOT NULL CHECK(length(trim(mime_type)) > 0),
        created_at INTEGER NOT NULL
          CHECK(created_at >= 0 AND created_at <= 9007199254740991),
        UNIQUE(vault_id, id)
      );

      INSERT INTO attachment_blobs(
        blob_id, vault_id, content_sha256, byte_length, local_state,
        file_key, manifest_version, manifest, created_at, updated_at
      )
      SELECT blob_id, vault_id, NULL, byte_length, local_state,
             file_key, manifest_version, manifest, created_at, updated_at
      FROM attachments;

      INSERT INTO attachments_v4(
        id, blob_id, vault_id, file_name, mime_type, created_at
      )
      SELECT id, blob_id, vault_id, file_name, mime_type, created_at
      FROM attachments;

      DROP INDEX attachments_state;
      DROP TABLE attachments;
      ALTER TABLE attachments_v4 RENAME TO attachments;

      CREATE UNIQUE INDEX attachment_blobs_ready_sha256
        ON attachment_blobs(vault_id, content_sha256)
        WHERE content_sha256 IS NOT NULL AND local_state = 'READY';
      CREATE INDEX attachment_blobs_state
        ON attachment_blobs(vault_id, local_state, blob_id);
      CREATE INDEX attachments_blob
        ON attachments(vault_id, blob_id, id);
    `);
  },
  validate(database: MigrationDatabase) {
    const blobColumns = columns(database, 'attachment_blobs');
    const attachmentColumns = columns(database, 'attachments');
    if (
      blobColumns.join(',') !==
        'blob_id,vault_id,content_sha256,byte_length,local_state,file_key,manifest_version,manifest,created_at,updated_at' ||
      attachmentColumns.join(',') !==
        'id,blob_id,vault_id,file_name,mime_type,created_at'
    ) {
      invalidMigration();
    }
    const invalid = database
      .prepare(
        `SELECT 1 FROM attachments a
         LEFT JOIN attachment_blobs b
           ON b.blob_id = a.blob_id AND b.vault_id = a.vault_id
         WHERE b.blob_id IS NULL
         OR (b.content_sha256 IS NOT NULL AND length(b.content_sha256) <> 32)
         LIMIT 1`,
      )
      .get();
    if (invalid !== undefined) invalidMigration();
    const index = database
      .prepare<{ sql: unknown }>(
        `SELECT sql FROM sqlite_master
         WHERE type = 'index' AND name = 'attachment_blobs_ready_sha256'`,
      )
      .get();
    if (typeof index?.sql !== 'string' || !index.sql.includes('READY')) {
      invalidMigration();
    }
  },
});
