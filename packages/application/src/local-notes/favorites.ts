import {
  asNoteId,
  asSortOrder,
  createFavorite,
  type Favorite,
  type Timestamp,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type { Page, PageRequest } from '../types';
import { favoriteNoteSummary } from './mapping';
import { getActiveNoteEntity } from './notes';
import type { FavoriteNoteSummary } from './types';

function allVisibleFavorites(database: VaultDatabase): readonly Favorite[] {
  const values: Favorite[] = [];
  let cursor: string | undefined;
  do {
    const page = database.favorites.list({
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    values.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return values;
}

export function listFavorites(
  database: VaultDatabase,
  input: PageRequest,
): Page<FavoriteNoteSummary> {
  const page = database.favorites.list({
    cursor: input?.cursor,
    limit: input?.limit,
  });
  return Object.freeze({
    items: Object.freeze(
      page.items.map((favorite) => favoriteNoteSummary(database, favorite)),
    ),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}

export function prepareFavoriteAppend(values: readonly Favorite[]): Readonly<{
  favorites: readonly Favorite[];
  sortOrder: Favorite['sortOrder'];
}> {
  const last = values.at(-1);
  if (last?.sortOrder === Number.MAX_SAFE_INTEGER) {
    return Object.freeze({
      favorites: Object.freeze(
        values.map((value, index) => ({
          ...value,
          sortOrder: asSortOrder(index),
        })),
      ),
      sortOrder: asSortOrder(values.length),
    });
  }
  return Object.freeze({
    favorites: values,
    sortOrder: asSortOrder((last?.sortOrder ?? -1) + 1),
  });
}

export function addFavorite(
  database: VaultDatabase,
  value: unknown,
  now: Timestamp,
): void {
  const noteId = asNoteId(value);
  database.transaction((transaction) => {
    const note = getActiveNoteEntity(database, noteId);
    const favorites = transaction.favorites.listAll();
    if (favorites.some((favorite) => favorite.noteId === note.id)) return;
    const append = prepareFavoriteAppend(favorites);
    if (append.favorites !== favorites) {
      transaction.favorites.replaceSortOrders(append.favorites);
    }
    transaction.favorites.insert(
      createFavorite({
        vaultId: note.vaultId,
        noteId: note.id,
        sortOrder: append.sortOrder,
        createdAt: now,
      }),
    );
  });
}

export function removeFavorite(database: VaultDatabase, value: unknown): void {
  const noteId = asNoteId(value);
  database.transaction((transaction) => transaction.favorites.delete(noteId));
}

export function reorderFavorite(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly beforeNoteId?: unknown },
): void {
  const noteId = asNoteId(input?.noteId);
  const beforeNoteId =
    input?.beforeNoteId === undefined
      ? undefined
      : asNoteId(input.beforeNoteId);
  database.transaction((transaction) => {
    const visible = allVisibleFavorites(database);
    if (!visible.some((favorite) => favorite.noteId === noteId)) {
      throw new ApplicationError('ENTITY_NOT_FOUND');
    }
    if (beforeNoteId === noteId) return;
    if (
      beforeNoteId !== undefined &&
      !visible.some((favorite) => favorite.noteId === beforeNoteId)
    ) {
      throw new ApplicationError('ENTITY_NOT_FOUND');
    }
    const all = transaction.favorites.listAll();
    const target = all.find((favorite) => favorite.noteId === noteId);
    if (target === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const reordered = all.filter((favorite) => favorite.noteId !== noteId);
    const index =
      beforeNoteId === undefined
        ? reordered.length
        : reordered.findIndex(({ noteId: id }) => id === beforeNoteId);
    if (index < 0) throw new ApplicationError('ENTITY_NOT_FOUND');
    reordered.splice(index, 0, target);
    transaction.favorites.replaceSortOrders(
      reordered.map((favorite, order) => ({
        ...favorite,
        sortOrder: asSortOrder(order),
      })),
    );
  });
}
