import type { VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';
import { NOTE_COLUMNS } from '../repositories/notes';
import { hydrateNote, type NoteRow } from '../serialization/rows';
import type { SearchIndexIssueCode, SearchIndexReport } from '../types';
import { insertNoteIndex } from './index-writer';
import { NORMALIZER_VERSION } from './normalize';

function count(
  database: SqlcipherConnection,
  sql: string,
  ...values: unknown[]
): number {
  const row = database.prepare<{ count: number }>(sql).get(...values);
  return row?.count ?? -1;
}

export function checkSearchIndex(
  database: SqlcipherConnection,
  vaultId: VaultId,
): SearchIndexReport {
  const issues: SearchIndexIssueCode[] = [];
  const metadata = database
    .prepare<{ normalizer_version: unknown; index_state: unknown }>(
      `SELECT normalizer_version, index_state
       FROM search_metadata WHERE singleton = 1`,
    )
    .all();
  if (
    metadata.length !== 1 ||
    metadata[0].normalizer_version !== NORMALIZER_VERSION ||
    metadata[0].index_state !== 'READY'
  ) {
    issues.push('METADATA_INVALID');
  }

  const activeCount = count(
    database,
    `SELECT count(*) AS count FROM notes n
     WHERE n.vault_id = ? AND NOT EXISTS (
       SELECT 1 FROM trash_entries t
       WHERE t.vault_id = n.vault_id AND t.object_type = 'NOTE'
         AND t.object_id = n.id
     )`,
    vaultId,
  );
  const indexCount = count(database, 'SELECT count(*) AS count FROM notes_fts');
  if (activeCount !== indexCount) {
    issues.push('NOTE_COUNT_MISMATCH');
  }

  const rowMismatch = database
    .prepare(
      `SELECT 1 FROM notes n
       LEFT JOIN notes_fts f ON f.rowid = n.row_id AND f.note_id = n.id
       WHERE n.vault_id = ? AND NOT EXISTS (
         SELECT 1 FROM trash_entries t
         WHERE t.vault_id = n.vault_id AND t.object_type = 'NOTE'
           AND t.object_id = n.id
       ) AND f.rowid IS NULL
       UNION ALL
       SELECT 1 FROM notes_fts f
       LEFT JOIN notes n ON n.row_id = f.rowid AND n.id = f.note_id
       WHERE n.row_id IS NULL LIMIT 1`,
    )
    .get(vaultId);
  if (rowMismatch !== undefined) {
    issues.push('ROWID_MISMATCH');
  }

  const versionMismatch = database
    .prepare(
      `SELECT 1 FROM notes n JOIN notes_fts f ON f.rowid = n.row_id
       WHERE n.vault_id = ? AND n.content_version != f.source_content_version
       LIMIT 1`,
    )
    .get(vaultId);
  if (versionMismatch !== undefined) {
    issues.push('SOURCE_VERSION_MISMATCH');
  }

  const trashedIndexed = database
    .prepare(
      `SELECT 1 FROM notes_fts f JOIN trash_entries t ON t.object_id = f.note_id
       WHERE t.vault_id = ? AND t.object_type = 'NOTE' LIMIT 1`,
    )
    .get(vaultId);
  if (trashedIndexed !== undefined) {
    issues.push('TRASHED_NOTE_INDEXED');
  }

  try {
    database.exec("INSERT INTO notes_fts(notes_fts) VALUES('integrity-check')");
  } catch {
    issues.push('FTS_INTEGRITY_FAILED');
  }
  return { ok: issues.length === 0, issues };
}

export function rebuildSearchIndex(
  database: SqlcipherConnection,
  vaultId: VaultId,
): void {
  database.transaction(() => {
    const metadata = database
      .prepare(
        `UPDATE search_metadata SET index_state = 'NEEDS_REBUILD'
         WHERE singleton = 1`,
      )
      .run();
    if (metadata.changes !== 1) {
      throw new StorageError('SEARCH_INDEX_UNAVAILABLE');
    }
    database.prepare('DELETE FROM notes_fts').run();
    const rows = database
      .prepare<NoteRow>(
        `SELECT ${NOTE_COLUMNS.replaceAll(/\b([a-z_]+)\b/g, 'n.$1')}
         FROM notes n WHERE n.vault_id = ? AND NOT EXISTS (
           SELECT 1 FROM trash_entries t
           WHERE t.vault_id = n.vault_id AND t.object_type = 'NOTE'
             AND t.object_id = n.id
         ) ORDER BY n.row_id`,
      )
      .all(vaultId);
    rows.forEach((row) => {
      if (typeof row.row_id !== 'number' && typeof row.row_id !== 'bigint') {
        throw new StorageError('DB_CORRUPT');
      }
      insertNoteIndex(database, row.row_id, hydrateNote(row));
    });
    database
      .prepare(
        `UPDATE search_metadata
         SET normalizer_version = ?, index_state = 'READY'
         WHERE singleton = 1`,
      )
      .run(NORMALIZER_VERSION);
    if (!checkSearchIndex(database, vaultId).ok) {
      throw new StorageError('SEARCH_INDEX_UNAVAILABLE');
    }
  })();
}
