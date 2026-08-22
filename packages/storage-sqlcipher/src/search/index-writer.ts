import type { Note } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { extractAdfText } from './adf-text';
import { normalizeSearchText } from './normalize';

function indexValues(note: Note): readonly [string, string] {
  return [
    normalizeSearchText(note.title).text,
    normalizeSearchText(extractAdfText(note.document)).text,
  ];
}

export function insertNoteIndex(
  database: SqlcipherConnection,
  rowId: number | bigint,
  note: Note,
): void {
  const [title, body] = indexValues(note);
  database
    .prepare(
      `INSERT INTO notes_fts(
         rowid, note_id, source_content_version, normalized_title, normalized_body
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(rowId, note.id, note.contentVersion, title, body);
}

export function replaceNoteIndex(
  database: SqlcipherConnection,
  rowId: number | bigint,
  note: Note,
): void {
  database.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(rowId);
  insertNoteIndex(database, rowId, note);
}
