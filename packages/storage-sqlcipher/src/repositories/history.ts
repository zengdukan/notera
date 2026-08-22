import { createHash } from 'node:crypto';

import type {
  ContentVersion,
  Note,
  NoteId,
  NoteVersion,
  NoteVersionId,
  VersionName,
  VaultId,
} from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import { serializeAdf } from '../serialization/adf-json';
import { hydrateNoteVersion, type NoteVersionRow } from '../serialization/rows';
import type { HistoryReader, HistoryWriter, Page, PageRequest } from '../types';
import type { NoteRepository } from './notes';

const HISTORY_COLUMNS = `
  id, vault_id, note_id, kind, protection_reason, version_name, source_content_version,
  title, adf_json, adf_bytes, adf_sha256, created_at
`;
const HISTORY_CURSOR = 'history.for-note';
type ConnectionProvider = () => SqlcipherConnection;
type UseGuard = () => void;

function relationViolation(): never {
  throw new StorageError('RELATION_INTEGRITY_VIOLATION');
}

export class HistoryRepository implements HistoryWriter {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly notes: NoteRepository,
    private readonly guard: UseGuard = () => {},
  ) {}

  get(id: NoteVersionId): NoteVersion | undefined {
    this.guard();
    const row = this.connection()
      .prepare<NoteVersionRow>(
        `SELECT ${HISTORY_COLUMNS} FROM note_versions WHERE id = ? AND vault_id = ?`,
      )
      .get(id, this.vaultId);
    return row ? hydrateNoteVersion(row) : undefined;
  }

  listForNote(noteId: NoteId, page: PageRequest): Page<NoteVersion> {
    this.guard();
    const cursor = parsePageRequest(page, HISTORY_CURSOR, `note:${noteId}`);
    const parameters: unknown[] = [this.vaultId, noteId];
    let keyset = '';
    if (cursor) {
      keyset = 'AND (created_at > ? OR (created_at = ? AND id > ?))';
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection()
      .prepare<NoteVersionRow>(
        `SELECT ${HISTORY_COLUMNS} FROM note_versions
       WHERE vault_id = ? AND note_id = ? ${keyset}
       ORDER BY created_at, id LIMIT ?`,
      )
      .all(...parameters);
    const items = rows.slice(0, page.limit).map(hydrateNoteVersion);
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > page.limit && last
        ? {
            nextCursor: encodeCursor(HISTORY_CURSOR, `note:${noteId}`, {
              sortOrder: last.createdAt,
              lastId: last.id,
            }),
          }
        : {}),
    };
  }

  insert(version: NoteVersion): void {
    this.guard();
    if (version.vaultId !== this.vaultId || this.get(version.id))
      relationViolation();
    const note = this.notes.get(version.noteId);
    if (!note || note.vaultId !== version.vaultId) relationViolation();
    const json = serializeAdf(version.document);
    const bytes = Buffer.from(json, 'utf8');
    const hash = createHash('sha256').update(bytes).digest();
    this.connection()
      .prepare(
        `INSERT INTO note_versions(
         id, vault_id, note_id, kind, protection_reason, version_name,
         source_content_version, title, adf_json, adf_bytes,
         adf_sha256, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        version.id,
        version.vaultId,
        version.noteId,
        version.kind,
        version.protectionReason,
        version.versionName,
        version.sourceContentVersion,
        version.title,
        json,
        bytes.byteLength,
        hash,
        version.createdAt,
      );
  }

  rename(
    noteId: NoteId,
    versionId: NoteVersionId,
    versionName: VersionName | null,
  ): NoteVersion {
    this.guard();
    const result = this.connection()
      .prepare(
        `UPDATE note_versions SET version_name = ?
         WHERE id = ? AND vault_id = ? AND note_id = ? AND kind = 'USER'`,
      )
      .run(versionName, versionId, this.vaultId, noteId);
    if (result.changes !== 1) relationViolation();
    const renamed = this.get(versionId);
    if (renamed === undefined) relationViolation();
    return renamed;
  }

  restore(
    version: NoteVersion,
    protectionVersion: NoteVersion,
    restoredNote: Note,
    expectedContentVersion: ContentVersion,
  ): void {
    this.guard();
    const stored = this.get(version.id);
    if (!stored || stored.noteId !== restoredNote.id) relationViolation();
    this.insert(protectionVersion);
    this.notes.replaceContent(restoredNote, expectedContentVersion);
  }
}

export const asHistoryReader = (repository: HistoryRepository): HistoryReader =>
  repository;
