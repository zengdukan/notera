import type { VaultIdentity } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';

export const BASE_SCHEMA_VERSION = 1;

const BASE_FILE_FORMAT_VERSION = 1;
const BASE_SEARCH_NORMALIZER_VERSION = 1;

const CANONICAL_UUID_GLOB =
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[1-8][0-9a-f][0-9a-f][0-9a-f]-' +
  '[89ab][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]';

function uuidCheck(column: string): string {
  return `typeof(${column}) = 'text' AND ${column} GLOB '${CANONICAL_UUID_GLOB}'`;
}

const BASE_SCHEMA_V1_SQL = `
  CREATE TABLE schema_metadata(
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    schema_version INTEGER NOT NULL
      CHECK(schema_version >= 1 AND schema_version <= 9007199254740991)
  );

  CREATE TABLE vault_metadata(
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    root_folder_id TEXT NOT NULL CHECK(${uuidCheck('root_folder_id')}),
    profile_name TEXT NOT NULL CHECK(length(trim(profile_name)) > 0),
    vault_meta_digest BLOB NOT NULL CHECK(length(vault_meta_digest) = 32),
    file_format_version INTEGER NOT NULL CHECK(file_format_version = 1)
  );

  CREATE TABLE search_metadata(
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    normalizer_version INTEGER NOT NULL
      CHECK(normalizer_version >= 1 AND normalizer_version <= 9007199254740991),
    index_state TEXT NOT NULL CHECK(index_state IN ('READY', 'NEEDS_REBUILD'))
  );

  CREATE TABLE folders(
    id TEXT PRIMARY KEY CHECK(${uuidCheck('id')}),
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    kind TEXT NOT NULL CHECK(kind IN ('ROOT', 'REGULAR')),
    parent_id TEXT CHECK(parent_id IS NULL OR (${uuidCheck('parent_id')})),
    name TEXT,
    sort_order INTEGER NOT NULL
      CHECK(sort_order >= 0 AND sort_order <= 9007199254740991),
    created_at INTEGER NOT NULL
      CHECK(created_at >= 0 AND created_at <= 9007199254740991),
    updated_at INTEGER NOT NULL
      CHECK(updated_at >= created_at AND updated_at <= 9007199254740991),
    CHECK(
      (kind = 'ROOT' AND parent_id IS NULL AND name IS NULL AND sort_order = 0)
      OR
      (kind = 'REGULAR' AND parent_id IS NOT NULL
        AND name IS NOT NULL AND length(trim(name)) > 0)
    ),
    UNIQUE(vault_id, parent_id, name)
  );

  CREATE UNIQUE INDEX folders_one_root_per_vault
    ON folders(vault_id) WHERE kind = 'ROOT';
  CREATE INDEX folders_parent_order
    ON folders(vault_id, parent_id, sort_order, id);

  CREATE TABLE notes(
    row_id INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE CHECK(${uuidCheck('id')}),
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    folder_id TEXT NOT NULL CHECK(${uuidCheck('folder_id')}),
    title TEXT NOT NULL,
    adf_json TEXT NOT NULL CHECK(json_valid(adf_json)),
    content_version INTEGER NOT NULL
      CHECK(content_version >= 1 AND content_version <= 9007199254740991),
    sort_order INTEGER NOT NULL
      CHECK(sort_order >= 0 AND sort_order <= 9007199254740991),
    created_at INTEGER NOT NULL
      CHECK(created_at >= 0 AND created_at <= 9007199254740991),
    updated_at INTEGER NOT NULL
      CHECK(updated_at >= created_at AND updated_at <= 9007199254740991)
  );

  CREATE INDEX notes_folder_order
    ON notes(vault_id, folder_id, sort_order, id);
  CREATE INDEX notes_recent
    ON notes(vault_id, updated_at DESC, id);

  CREATE TABLE note_versions(
    id TEXT PRIMARY KEY CHECK(${uuidCheck('id')}),
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    note_id TEXT NOT NULL CHECK(${uuidCheck('note_id')}),
    kind TEXT NOT NULL CHECK(kind IN ('USER', 'SYSTEM_PROTECTION')),
    protection_reason TEXT
      CHECK(protection_reason IS NULL OR protection_reason IN (
        'BEFORE_HISTORY_RESTORE', 'BEFORE_MIGRATION'
      )),
    source_content_version INTEGER NOT NULL
      CHECK(source_content_version >= 1
        AND source_content_version <= 9007199254740991),
    title TEXT NOT NULL,
    adf_json TEXT NOT NULL CHECK(json_valid(adf_json)),
    adf_bytes INTEGER NOT NULL
      CHECK(adf_bytes >= 0 AND adf_bytes <= 9007199254740991),
    adf_sha256 BLOB NOT NULL CHECK(length(adf_sha256) = 32),
    created_at INTEGER NOT NULL
      CHECK(created_at >= 0 AND created_at <= 9007199254740991),
    CHECK(
      (kind = 'USER' AND protection_reason IS NULL)
      OR
      (kind = 'SYSTEM_PROTECTION' AND protection_reason IS NOT NULL)
    )
  );

  CREATE INDEX note_versions_note_created
    ON note_versions(vault_id, note_id, created_at DESC, id);

  CREATE TABLE tags(
    id TEXT PRIMARY KEY CHECK(${uuidCheck('id')}),
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    created_at INTEGER NOT NULL
      CHECK(created_at >= 0 AND created_at <= 9007199254740991),
    updated_at INTEGER NOT NULL
      CHECK(updated_at >= created_at AND updated_at <= 9007199254740991),
    UNIQUE(vault_id, name)
  );

  CREATE INDEX tags_name ON tags(vault_id, name, id);

  CREATE TABLE note_tags(
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    note_id TEXT NOT NULL CHECK(${uuidCheck('note_id')}),
    tag_id TEXT NOT NULL CHECK(${uuidCheck('tag_id')}),
    PRIMARY KEY(vault_id, note_id, tag_id)
  );

  CREATE INDEX note_tags_tag ON note_tags(vault_id, tag_id, note_id);

  CREATE TABLE favorites(
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    note_id TEXT NOT NULL CHECK(${uuidCheck('note_id')}),
    sort_order INTEGER NOT NULL
      CHECK(sort_order >= 0 AND sort_order <= 9007199254740991),
    created_at INTEGER NOT NULL
      CHECK(created_at >= 0 AND created_at <= 9007199254740991),
    PRIMARY KEY(vault_id, note_id)
  );

  CREATE UNIQUE INDEX favorites_order
    ON favorites(vault_id, sort_order);

  CREATE TABLE trash_entries(
    id TEXT PRIMARY KEY CHECK(${uuidCheck('id')}),
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    object_type TEXT NOT NULL CHECK(object_type IN ('NOTE', 'FOLDER')),
    object_id TEXT NOT NULL CHECK(${uuidCheck('object_id')}),
    original_parent_id TEXT NOT NULL CHECK(${uuidCheck('original_parent_id')}),
    deleted_at INTEGER NOT NULL
      CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
    expires_at INTEGER NOT NULL
      CHECK(expires_at >= deleted_at AND expires_at <= 9007199254740991),
    UNIQUE(vault_id, object_type, object_id)
  );

  CREATE INDEX trash_entries_expiry
    ON trash_entries(vault_id, expires_at, id);

  CREATE TABLE attachments(
    id TEXT PRIMARY KEY CHECK(${uuidCheck('id')}),
    blob_id TEXT NOT NULL CHECK(${uuidCheck('blob_id')}),
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    file_name TEXT NOT NULL CHECK(length(trim(file_name)) > 0),
    mime_type TEXT NOT NULL CHECK(length(trim(mime_type)) > 0),
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

  CREATE INDEX attachments_state
    ON attachments(vault_id, local_state, id);

  CREATE TABLE attachment_references(
    row_id INTEGER PRIMARY KEY,
    vault_id TEXT NOT NULL CHECK(${uuidCheck('vault_id')}),
    attachment_id TEXT NOT NULL CHECK(${uuidCheck('attachment_id')}),
    source_type TEXT NOT NULL CHECK(source_type IN ('NOTE', 'NOTE_VERSION', 'TRASH')),
    note_id TEXT CHECK(note_id IS NULL OR (${uuidCheck('note_id')})),
    note_version_id TEXT
      CHECK(note_version_id IS NULL OR (${uuidCheck('note_version_id')})),
    trash_entry_id TEXT
      CHECK(trash_entry_id IS NULL OR (${uuidCheck('trash_entry_id')})),
    CHECK(
      (note_id IS NOT NULL) +
      (note_version_id IS NOT NULL) +
      (trash_entry_id IS NOT NULL) = 1
    ),
    CHECK(
      (source_type = 'NOTE' AND note_id IS NOT NULL)
      OR (source_type = 'NOTE_VERSION' AND note_version_id IS NOT NULL)
      OR (source_type = 'TRASH' AND trash_entry_id IS NOT NULL)
    )
  );

  CREATE UNIQUE INDEX attachment_references_note
    ON attachment_references(vault_id, attachment_id, note_id)
    WHERE source_type = 'NOTE';
  CREATE UNIQUE INDEX attachment_references_version
    ON attachment_references(vault_id, attachment_id, note_version_id)
    WHERE source_type = 'NOTE_VERSION';
  CREATE UNIQUE INDEX attachment_references_trash
    ON attachment_references(vault_id, attachment_id, trash_entry_id)
    WHERE source_type = 'TRASH';
  CREATE INDEX attachment_references_attachment
    ON attachment_references(vault_id, attachment_id);

  CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id UNINDEXED,
    source_content_version UNINDEXED,
    normalized_title,
    normalized_body,
    tokenize='trigram'
  );
`;

export interface BaselineV1Input {
  readonly identity: VaultIdentity;
  readonly profileName: string;
  readonly vaultMetaDigest: Uint8Array;
  readonly createdAt: number;
}

export function createBaselineV1(
  database: SqlcipherConnection,
  input: BaselineV1Input,
): void {
  database.exec(BASE_SCHEMA_V1_SQL);
  database
    .prepare(
      `INSERT INTO schema_metadata(singleton, schema_version)
       VALUES (1, ?)`,
    )
    .run(BASE_SCHEMA_VERSION);
  database
    .prepare(
      `INSERT INTO vault_metadata(
         singleton, vault_id, root_folder_id, profile_name,
         vault_meta_digest, file_format_version
       ) VALUES (1, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.identity.id,
      input.identity.rootFolderId,
      input.profileName,
      Buffer.from(input.vaultMetaDigest),
      BASE_FILE_FORMAT_VERSION,
    );
  database
    .prepare(
      `INSERT INTO search_metadata(singleton, normalizer_version, index_state)
       VALUES (1, ?, 'READY')`,
    )
    .run(BASE_SEARCH_NORMALIZER_VERSION);
  database
    .prepare(
      `INSERT INTO folders(
         id, vault_id, kind, parent_id, name, sort_order, created_at, updated_at
       ) VALUES (?, ?, 'ROOT', NULL, NULL, 0, ?, ?)`,
    )
    .run(
      input.identity.rootFolderId,
      input.identity.id,
      input.createdAt,
      input.createdAt,
    );
}
