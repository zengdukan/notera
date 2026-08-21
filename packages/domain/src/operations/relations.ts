import { assertDomain } from '../errors';
import type { NoteId, TagId } from '../ids';
import {
  createFavorite,
  type Favorite,
} from '../models/favorite';
import type { Note } from '../models/note';
import { createNoteTag, type NoteTag, type Tag } from '../models/tag';

function immutableArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

export function addNoteTag(
  note: Note,
  tag: Tag,
  noteTags: readonly NoteTag[],
): readonly NoteTag[] {
  assertDomain(note.vaultId === tag.vaultId, 'VAULT_MISMATCH');
  const existing = noteTags.find(
    (item) => item.noteId === note.id && item.tagId === tag.id,
  );
  if (existing) {
    assertDomain(existing.vaultId === note.vaultId, 'VAULT_MISMATCH');
    return immutableArray(noteTags);
  }
  return immutableArray([
    ...noteTags,
    createNoteTag({ vaultId: note.vaultId, noteId: note.id, tagId: tag.id }),
  ]);
}

export function removeNoteTag(
  noteId: NoteId,
  tagId: TagId,
  noteTags: readonly NoteTag[],
): readonly NoteTag[] {
  return immutableArray(
    noteTags.filter(
      (item) => item.noteId !== noteId || item.tagId !== tagId,
    ),
  );
}

export function addFavorite(
  note: Note,
  favorite: Favorite,
  favorites: readonly Favorite[],
): readonly Favorite[] {
  assertDomain(
    favorite.vaultId === note.vaultId && favorite.noteId === note.id,
    'VAULT_MISMATCH',
  );
  if (favorites.some((item) => item.noteId === note.id)) {
    return immutableArray(favorites);
  }
  return immutableArray([...favorites, createFavorite(favorite)]);
}

export function removeFavorite(
  noteId: NoteId,
  favorites: readonly Favorite[],
): readonly Favorite[] {
  return immutableArray(favorites.filter((item) => item.noteId !== noteId));
}
