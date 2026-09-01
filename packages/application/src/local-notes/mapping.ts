import type {
  Favorite,
  Folder,
  Note,
  NoteId,
  NoteVersion,
  Tag,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type {
  FolderSummary,
  FavoriteNoteSummary,
  HistorySummary,
  NoteDetail,
  NoteSummary,
  TagSummary,
  TreeEntrySummary,
} from './types';

export function folderSummary(
  database: VaultDatabase,
  folder: Folder,
): FolderSummary {
  if (folder.kind !== 'REGULAR') {
    throw new ApplicationError('OPERATION_FAILED');
  }
  return Object.freeze({
    kind: 'folder' as const,
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    updatedAt: folder.updatedAt,
    hasChildren:
      database.folders.listContent(folder.id, { limit: 1 }).items.length > 0,
  });
}

export function noteSummary(note: Note): NoteSummary {
  return Object.freeze({
    kind: 'note' as const,
    id: note.id,
    title: note.title,
    folderId: note.folderId,
    contentVersion: note.contentVersion,
    updatedAt: note.updatedAt,
  });
}

export function tagSummary(tag: Tag): TagSummary {
  return Object.freeze({
    id: tag.id,
    name: tag.name,
    updatedAt: tag.updatedAt,
  });
}

export function noteDetail(database: VaultDatabase, note: Note): NoteDetail {
  let cursor: string | undefined;
  let isFavorite = false;
  do {
    const page = database.favorites.list({
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    isFavorite = page.items.some((favorite) => favorite.noteId === note.id);
    cursor = isFavorite ? undefined : page.nextCursor;
  } while (cursor !== undefined);
  return Object.freeze({
    ...noteSummary(note),
    document: note.document,
    createdAt: note.createdAt,
    isFavorite,
    tags: Object.freeze(database.tags.listForNote(note.id).map(tagSummary)),
  });
}

export function favoriteNoteSummary(
  database: VaultDatabase,
  favorite: Favorite,
): FavoriteNoteSummary {
  const note = database.notes.get(favorite.noteId);
  if (note === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
  return Object.freeze({
    ...noteSummary(note),
    favoriteSortOrder: favorite.sortOrder,
  });
}

export function historySummary(version: NoteVersion): HistorySummary {
  return Object.freeze({
    versionId: version.id,
    noteId: version.noteId,
    kind: version.kind,
    protectionReason: version.protectionReason,
    versionName: version.versionName,
    displayTitle: version.title,
    createdAt: version.createdAt,
  });
}

export function favoriteNoteIds(database: VaultDatabase): ReadonlySet<NoteId> {
  const noteIds = new Set<NoteId>();
  let cursor: string | undefined;
  do {
    const page = database.favorites.list({
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    page.items.forEach(({ noteId }) => noteIds.add(noteId));
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return noteIds;
}

export function treeEntrySummary(
  database: VaultDatabase,
  value: Folder | Note,
  favoriteIds: ReadonlySet<NoteId>,
): TreeEntrySummary {
  return 'kind' in value
    ? folderSummary(database, value)
    : Object.freeze({
        ...noteSummary(value),
        isFavorite: favoriteIds.has(value.id),
      });
}
