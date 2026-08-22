import type {
  ContentVersion,
  FolderId,
  Note,
  NoteId,
  VaultId,
} from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import { insertNoteIndex, replaceNoteIndex } from '../search/index-writer';
import { serializeAdf } from '../serialization/adf-json';
import { hydrateNote, type NoteRow } from '../serialization/rows';
import type { NoteReader, NoteWriter, Page, PageRequest } from '../types';

export const NOTE_COLUMNS = `
  row_id, id, vault_id, folder_id, title, adf_json,
  content_version, sort_order, created_at, updated_at
`;

const BY_FOLDER_CURSOR = 'notes.by-folder';
const RECENT_CURSOR = 'notes.recent';

type ConnectionProvider = () => SqlcipherConnection;
type UseGuard = () => void;

function relationViolation(): never {
  throw new StorageError('RELATION_INTEGRITY_VIOLATION');
}

export class NoteRepository implements NoteWriter {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly guard: UseGuard = () => {},
  ) {}

  get(id: NoteId): Note | undefined {
    this.guard();
    const row = this.connection()
      .prepare<NoteRow>(
        `SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ? AND vault_id = ?`,
      )
      .get(id, this.vaultId);
    return row === undefined ? undefined : hydrateNote(row);
  }

  private assertActiveFolder(folderId: FolderId): void {
    const folder = this.connection()
      .prepare(
        `SELECT 1 AS found FROM folders f
         WHERE f.id = ? AND f.vault_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM trash_entries t
             WHERE t.vault_id = f.vault_id
               AND t.object_type = 'FOLDER' AND t.object_id = f.id
           )`,
      )
      .get(folderId, this.vaultId);
    if (folder === undefined) {
      relationViolation();
    }
  }

  listByFolder(folderId: FolderId, page: PageRequest): Page<Note> {
    this.guard();
    this.assertActiveFolder(folderId);
    const cursor = parsePageRequest(page, BY_FOLDER_CURSOR, `folder:${folderId}`);
    const parameters: unknown[] = [this.vaultId, folderId, this.vaultId];
    let keyset = '';
    if (cursor !== undefined) {
      keyset = 'AND (n.sort_order > ? OR (n.sort_order = ? AND n.id > ?))';
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection()
      .prepare<NoteRow>(
        `SELECT ${NOTE_COLUMNS.replaceAll(/\b([a-z_]+)\b/g, 'n.$1')}
         FROM notes n
         WHERE n.vault_id = ? AND n.folder_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM trash_entries t
             WHERE t.vault_id = ? AND t.object_type = 'NOTE'
               AND t.object_id = n.id
           )
           ${keyset}
         ORDER BY n.sort_order, n.id LIMIT ?`,
      )
      .all(...parameters);
    return this.page(rows, page, BY_FOLDER_CURSOR, `folder:${folderId}`);
  }

  listRecent(page: PageRequest): Page<Note> {
    this.guard();
    const cursor = parsePageRequest(page, RECENT_CURSOR, `vault:${this.vaultId}`);
    const parameters: unknown[] = [this.vaultId, this.vaultId];
    let keyset = '';
    if (cursor !== undefined) {
      keyset = 'AND (n.updated_at < ? OR (n.updated_at = ? AND n.id > ?))';
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection()
      .prepare<NoteRow>(
        `SELECT ${NOTE_COLUMNS.replaceAll(/\b([a-z_]+)\b/g, 'n.$1')}
         FROM notes n
         WHERE n.vault_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM trash_entries t
             WHERE t.vault_id = ? AND t.object_type = 'NOTE'
               AND t.object_id = n.id
           )
           ${keyset}
         ORDER BY n.updated_at DESC, n.id LIMIT ?`,
      )
      .all(...parameters);
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).map(hydrateNote);
    const last = items.at(-1);
    return {
      items,
      ...(hasMore && last
        ? {
            nextCursor: encodeCursor(RECENT_CURSOR, `vault:${this.vaultId}`, {
              sortOrder: last.updatedAt,
              lastId: last.id,
            }),
          }
        : {}),
    };
  }

  private page(
    rows: readonly NoteRow[],
    page: PageRequest,
    kind: string,
    fingerprint: string,
  ): Page<Note> {
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).map(hydrateNote);
    const last = items.at(-1);
    return {
      items,
      ...(hasMore && last
        ? {
            nextCursor: encodeCursor(kind, fingerprint, {
              sortOrder: last.sortOrder,
              lastId: last.id,
            }),
          }
        : {}),
    };
  }

  insert(note: Note): void {
    this.guard();
    if (note.vaultId !== this.vaultId || this.get(note.id) !== undefined) {
      relationViolation();
    }
    this.assertActiveFolder(note.folderId);
    const result = this.connection()
      .prepare(
        `INSERT INTO notes(
           id, vault_id, folder_id, title, adf_json, content_version,
           sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        note.id,
        note.vaultId,
        note.folderId,
        note.title,
        serializeAdf(note.document),
        note.contentVersion,
        note.sortOrder,
        note.createdAt,
        note.updatedAt,
      );
    insertNoteIndex(this.connection(), result.lastInsertRowid, note);
  }

  replaceContent(note: Note, expectedContentVersion: ContentVersion): void {
    this.guard();
    const existing = this.get(note.id);
    if (existing === undefined) {
      throw new StorageError('ENTITY_NOT_FOUND');
    }
    if (
      note.vaultId !== this.vaultId ||
      note.contentVersion !== expectedContentVersion + 1 ||
      note.folderId !== existing.folderId ||
      note.sortOrder !== existing.sortOrder ||
      note.createdAt !== existing.createdAt
    ) {
      throw new StorageError('CONTENT_VERSION_CONFLICT');
    }
    const result = this.connection()
      .prepare(
        `UPDATE notes SET title = ?, adf_json = ?, content_version = ?, updated_at = ?
         WHERE id = ? AND vault_id = ? AND content_version = ?`,
      )
      .run(
        note.title,
        serializeAdf(note.document),
        note.contentVersion,
        note.updatedAt,
        note.id,
        this.vaultId,
        expectedContentVersion,
      );
    if (result.changes !== 1) {
      throw new StorageError('CONTENT_VERSION_CONFLICT');
    }
    const row = this.connection()
      .prepare<{ row_id: number | bigint }>(
        'SELECT row_id FROM notes WHERE id = ? AND vault_id = ?',
      )
      .get(note.id, this.vaultId);
    if (row === undefined) {
      throw new StorageError('DB_CORRUPT');
    }
    replaceNoteIndex(this.connection(), row.row_id, note);
  }

  replaceLocation(note: Note): void {
    this.guard();
    const existing = this.get(note.id);
    if (
      existing === undefined ||
      note.vaultId !== this.vaultId ||
      note.contentVersion !== existing.contentVersion ||
      note.title !== existing.title ||
      serializeAdf(note.document) !== serializeAdf(existing.document)
    ) {
      relationViolation();
    }
    this.assertActiveFolder(note.folderId);
    this.connection()
      .prepare(
        `UPDATE notes SET folder_id = ?, sort_order = ?, updated_at = ?
         WHERE id = ? AND vault_id = ?`,
      )
      .run(note.folderId, note.sortOrder, note.updatedAt, note.id, this.vaultId);
  }

  replaceSortOrders(notes: readonly Note[]): void {
    this.guard();
    const seen = new Set<NoteId>();
    notes.forEach((note) => {
      const existing = this.get(note.id);
      if (
        seen.has(note.id) ||
        existing === undefined ||
        note.vaultId !== this.vaultId ||
        note.folderId !== existing.folderId ||
        note.contentVersion !== existing.contentVersion ||
        note.title !== existing.title ||
        serializeAdf(note.document) !== serializeAdf(existing.document)
      ) {
        relationViolation();
      }
      seen.add(note.id);
      this.connection()
        .prepare(
          `UPDATE notes SET sort_order = ?, updated_at = ?
           WHERE id = ? AND vault_id = ?`,
        )
        .run(note.sortOrder, note.updatedAt, note.id, this.vaultId);
    });
  }
}

export function asNoteReader(repository: NoteRepository): NoteReader {
  return repository;
}
