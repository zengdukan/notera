import type { Migration, MigrationDatabase } from '../migrations/types';

const UUID_GLOB =
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[1-8][0-9a-f][0-9a-f][0-9a-f]-' +
  '[89ab][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]';

const MAX_ATTACHMENT_BYTES_V6 = 524_288_000;
const uuid = (column: string) =>
  `typeof(${column}) = 'text' AND ${column} GLOB '${UUID_GLOB}'`;

function invalidMigration(): never {
  throw new Error('Invalid attachment size limit migration.');
}

export const V6_ATTACHMENT_SIZE_LIMIT: Migration = Object.freeze({
  targetVersion: 6,
  migrate(database: MigrationDatabase) {
    database.exec(`
      CREATE TABLE attachment_blobs_v6(
        blob_id TEXT PRIMARY KEY CHECK(${uuid('blob_id')}),
        vault_id TEXT NOT NULL CHECK(${uuid('vault_id')}),
        content_sha256 BLOB CHECK(
          content_sha256 IS NULL OR length(content_sha256) = 32
        ),
        byte_length INTEGER NOT NULL
          CHECK(byte_length >= 0 AND byte_length <= ${MAX_ATTACHMENT_BYTES_V6}),
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

      INSERT INTO attachment_blobs_v6(
        blob_id, vault_id, content_sha256, byte_length, local_state,
        file_key, manifest_version, manifest, created_at, updated_at
      )
      SELECT blob_id, vault_id, content_sha256, byte_length, local_state,
             file_key, manifest_version, manifest, created_at, updated_at
      FROM attachment_blobs;

      DROP INDEX attachment_blobs_ready_sha256;
      DROP INDEX attachment_blobs_state;
      DROP TABLE attachment_blobs;
      ALTER TABLE attachment_blobs_v6 RENAME TO attachment_blobs;

      CREATE UNIQUE INDEX attachment_blobs_ready_sha256
        ON attachment_blobs(vault_id, content_sha256)
        WHERE content_sha256 IS NOT NULL AND local_state = 'READY';
      CREATE INDEX attachment_blobs_state
        ON attachment_blobs(vault_id, local_state, blob_id);
    `);
  },
  validate(database: MigrationDatabase) {
    const table = database
      .prepare<{ sql: unknown }>(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'attachment_blobs'`,
      )
      .get();
    if (
      typeof table?.sql !== 'string' ||
      !table.sql.includes(`byte_length <= ${MAX_ATTACHMENT_BYTES_V6}`)
    ) {
      invalidMigration();
    }
    const invalid = database
      .prepare(
        `SELECT 1 FROM attachment_blobs
         WHERE byte_length < 0 OR byte_length > ${MAX_ATTACHMENT_BYTES_V6}
         LIMIT 1`,
      )
      .get();
    if (invalid !== undefined) invalidMigration();
  },
});
