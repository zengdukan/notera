import type { NoteId, NoteTag, Tag, TagId, VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import { hydrateTag, type TagRow } from '../serialization/rows';
import type { Page, PageRequest, TagReader, TagWriter } from '../types';

const TAG_COLUMNS = 'id, vault_id, name, created_at, updated_at';
const TAG_CURSOR = 'tags.list';

type ConnectionProvider = () => SqlcipherConnection;
type UseGuard = () => void;

function relationViolation(): never {
  throw new StorageError('RELATION_INTEGRITY_VIOLATION');
}

export class TagRepository implements TagWriter {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly guard: UseGuard = () => {},
  ) {}

  get(id: TagId): Tag | undefined {
    this.guard();
    const row = this.connection()
      .prepare<TagRow>(
        `SELECT ${TAG_COLUMNS} FROM tags WHERE id = ? AND vault_id = ?`,
      )
      .get(id, this.vaultId);
    return row ? hydrateTag(row) : undefined;
  }

  list(page: PageRequest): Page<Tag> {
    this.guard();
    const cursor = parsePageRequest(page, TAG_CURSOR, `vault:${this.vaultId}`);
    const parameters: unknown[] = [this.vaultId];
    let keyset = '';
    if (cursor) {
      keyset = 'AND (created_at > ? OR (created_at = ? AND id > ?))';
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection()
      .prepare<TagRow>(
        `SELECT ${TAG_COLUMNS} FROM tags WHERE vault_id = ? ${keyset}
         ORDER BY created_at, id LIMIT ?`,
      )
      .all(...parameters);
    const items = rows.slice(0, page.limit).map(hydrateTag);
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > page.limit && last
        ? {
            nextCursor: encodeCursor(TAG_CURSOR, `vault:${this.vaultId}`, {
              sortOrder: last.createdAt,
              lastId: last.id,
            }),
          }
        : {}),
    };
  }

  listForNote(noteId: NoteId): readonly Tag[] {
    this.guard();
    return this.connection()
      .prepare<TagRow>(
        `SELECT t.${TAG_COLUMNS.replaceAll(', ', ', t.')}
         FROM tags t JOIN note_tags nt
           ON nt.vault_id = t.vault_id AND nt.tag_id = t.id
         WHERE nt.vault_id = ? AND nt.note_id = ?
         ORDER BY t.name, t.id`,
      )
      .all(this.vaultId, noteId)
      .map(hydrateTag);
  }

  insert(tag: Tag): void {
    this.guard();
    if (tag.vaultId !== this.vaultId || this.get(tag.id)) {
      relationViolation();
    }
    this.connection()
      .prepare(
        `INSERT INTO tags(id, vault_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(tag.id, tag.vaultId, tag.name, tag.createdAt, tag.updatedAt);
  }

  replace(tag: Tag): void {
    this.guard();
    const existing = this.get(tag.id);
    if (
      !existing ||
      tag.vaultId !== this.vaultId ||
      tag.createdAt !== existing.createdAt
    ) {
      relationViolation();
    }
    this.connection()
      .prepare(
        'UPDATE tags SET name = ?, updated_at = ? WHERE id = ? AND vault_id = ?',
      )
      .run(tag.name, tag.updatedAt, tag.id, this.vaultId);
  }

  delete(id: TagId): void {
    this.guard();
    const related = this.connection()
      .prepare(
        'SELECT 1 FROM note_tags WHERE vault_id = ? AND tag_id = ? LIMIT 1',
      )
      .get(this.vaultId, id);
    if (related) {
      relationViolation();
    }
    this.connection()
      .prepare('DELETE FROM tags WHERE id = ? AND vault_id = ?')
      .run(id, this.vaultId);
  }

  private assertActiveNote(noteId: NoteId): void {
    const row = this.connection()
      .prepare(
        `SELECT 1 FROM notes n WHERE n.id = ? AND n.vault_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM trash_entries tr WHERE tr.vault_id = n.vault_id
           AND tr.object_type = 'NOTE' AND tr.object_id = n.id
       )`,
      )
      .get(noteId, this.vaultId);
    if (!row) relationViolation();
  }

  addToNote(value: NoteTag): void {
    this.guard();
    if (value.vaultId !== this.vaultId || !this.get(value.tagId))
      relationViolation();
    this.assertActiveNote(value.noteId);
    this.connection()
      .prepare(
        'INSERT OR IGNORE INTO note_tags(vault_id, note_id, tag_id) VALUES (?, ?, ?)',
      )
      .run(this.vaultId, value.noteId, value.tagId);
  }

  removeFromNote(noteId: NoteId, tagId: TagId): void {
    this.guard();
    this.connection()
      .prepare(
        'DELETE FROM note_tags WHERE vault_id = ? AND note_id = ? AND tag_id = ?',
      )
      .run(this.vaultId, noteId, tagId);
  }
}

export const asTagReader = (repository: TagRepository): TagReader => repository;
