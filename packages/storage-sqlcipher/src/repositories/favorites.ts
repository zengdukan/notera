import type { Favorite, NoteId, VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import { hydrateFavorite, type FavoriteRow } from '../serialization/rows';
import type { FavoriteReader, FavoriteWriter, Page, PageRequest } from '../types';

const FAVORITE_CURSOR = 'favorites.list';
type ConnectionProvider = () => SqlcipherConnection;
type UseGuard = () => void;

function relationViolation(): never {
  throw new StorageError('RELATION_INTEGRITY_VIOLATION');
}

export class FavoriteRepository implements FavoriteWriter {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly guard: UseGuard = () => {},
  ) {}

  private assertActiveNote(noteId: NoteId): void {
    const row = this.connection().prepare(
      `SELECT 1 FROM notes n WHERE n.id = ? AND n.vault_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM trash_entries tr WHERE tr.vault_id = n.vault_id
           AND tr.object_type = 'NOTE' AND tr.object_id = n.id
       )`,
    ).get(noteId, this.vaultId);
    if (!row) relationViolation();
  }

  list(page: PageRequest): Page<Favorite> {
    this.guard();
    const cursor = parsePageRequest(page, FAVORITE_CURSOR, `vault:${this.vaultId}`);
    const parameters: unknown[] = [this.vaultId, this.vaultId];
    let keyset = '';
    if (cursor) {
      keyset = 'AND (f.sort_order > ? OR (f.sort_order = ? AND f.note_id > ?))';
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection().prepare<FavoriteRow>(
      `SELECT f.vault_id, f.note_id, f.sort_order, f.created_at
       FROM favorites f WHERE f.vault_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM trash_entries tr WHERE tr.vault_id = ?
             AND tr.object_type = 'NOTE' AND tr.object_id = f.note_id
         ) ${keyset}
       ORDER BY f.sort_order, f.note_id LIMIT ?`,
    ).all(...parameters);
    const items = rows.slice(0, page.limit).map(hydrateFavorite);
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > page.limit && last
        ? { nextCursor: encodeCursor(FAVORITE_CURSOR, `vault:${this.vaultId}`, {
            sortOrder: last.sortOrder,
            lastId: last.noteId,
          }) }
        : {}),
    };
  }

  insert(value: Favorite): void {
    this.guard();
    if (value.vaultId !== this.vaultId) relationViolation();
    this.assertActiveNote(value.noteId);
    const existing = this.connection().prepare(
      'SELECT 1 FROM favorites WHERE vault_id = ? AND note_id = ?',
    ).get(this.vaultId, value.noteId);
    if (existing) return;
    this.connection().prepare(
      `INSERT INTO favorites(vault_id, note_id, sort_order, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(this.vaultId, value.noteId, value.sortOrder, value.createdAt);
  }

  delete(noteId: NoteId): void {
    this.guard();
    this.connection().prepare('DELETE FROM favorites WHERE vault_id = ? AND note_id = ?')
      .run(this.vaultId, noteId);
  }

  replaceSortOrders(values: readonly Favorite[]): void {
    this.guard();
    const seen = new Set<NoteId>();
    values.forEach((value) => {
      if (seen.has(value.noteId) || value.vaultId !== this.vaultId) {
        relationViolation();
      }
      const existing = this.connection().prepare<FavoriteRow>(
        `SELECT vault_id, note_id, sort_order, created_at FROM favorites
         WHERE vault_id = ? AND note_id = ?`,
      ).get(this.vaultId, value.noteId);
      if (!existing || existing.created_at !== value.createdAt) {
        relationViolation();
      }
      seen.add(value.noteId);
    });
    if (values.length === 0) return;
    if (new Set(values.map(({ sortOrder }) => sortOrder)).size !== values.length) {
      relationViolation();
    }
    const placeholders = values.map(() => '?').join(', ');
    const collision = this.connection().prepare(
      `SELECT 1 FROM favorites WHERE vault_id = ?
       AND sort_order IN (${placeholders})
       AND note_id NOT IN (${placeholders}) LIMIT 1`,
    ).get(
      this.vaultId,
      ...values.map(({ sortOrder }) => sortOrder),
      ...values.map(({ noteId }) => noteId),
    );
    if (collision) relationViolation();
    this.connection().prepare(
      `DELETE FROM favorites WHERE vault_id = ?
       AND note_id IN (${placeholders})`,
    ).run(this.vaultId, ...values.map(({ noteId }) => noteId));
    values.forEach((value) => {
      this.connection().prepare(
        `INSERT INTO favorites(vault_id, note_id, sort_order, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(this.vaultId, value.noteId, value.sortOrder, value.createdAt);
    });
  }
}

export const asFavoriteReader = (
  repository: FavoriteRepository,
): FavoriteReader => repository;
