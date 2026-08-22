import type { Folder, Note, Tag } from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type {
  FolderSummary,
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
  return Object.freeze({ id: tag.id, name: tag.name, updatedAt: tag.updatedAt });
}

export function noteDetail(database: VaultDatabase, note: Note): NoteDetail {
  return Object.freeze({
    ...noteSummary(note),
    document: note.document,
    createdAt: note.createdAt,
    tags: Object.freeze(database.tags.listForNote(note.id).map(tagSummary)),
  });
}

export function treeEntrySummary(
  database: VaultDatabase,
  value: Folder | Note,
): TreeEntrySummary {
  return 'kind' in value
    ? folderSummary(database, value)
    : noteSummary(value);
}
