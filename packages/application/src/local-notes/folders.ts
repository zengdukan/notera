import {
  asFolderId,
  asFolderName,
  asSortOrder,
  createRegularFolder,
  moveFolder as moveDomainFolder,
  renameFolder as renameDomainFolder,
  type Timestamp,
} from '@notera/domain';
import type {
  ContentSort as StorageContentSort,
  VaultDatabase,
} from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import { folderSummary, treeEntrySummary } from './mapping';
import type {
  ContentSort,
  FolderSummary,
  ListChildrenInput,
  TreeEntrySummary,
} from './types';
import type { Page } from '../types';

const DEFAULT_SORT: ContentSort = Object.freeze({
  field: 'CREATED_AT',
  direction: 'DESC',
});

function checkedName(value: unknown): ReturnType<typeof asFolderName> {
  if (typeof value !== 'string') throw new ApplicationError('INVALID_NAME');
  const trimmed = value.trim();
  if ([...trimmed].length < 1 || [...trimmed].length > 255) {
    throw new ApplicationError('INVALID_NAME');
  }
  return asFolderName(trimmed);
}

function checkedSort(value: ContentSort | undefined): StorageContentSort {
  const sort = value ?? DEFAULT_SORT;
  if (
    (sort.field !== 'CREATED_AT' &&
      sort.field !== 'UPDATED_AT' &&
      sort.field !== 'TITLE') ||
    (sort.direction !== 'ASC' && sort.direction !== 'DESC')
  ) {
    throw new ApplicationError('INVALID_CURSOR');
  }
  return sort;
}

export function listChildren(
  database: VaultDatabase,
  input: ListChildrenInput,
): Page<TreeEntrySummary> {
  const parentFolderId = asFolderId(input?.parentFolderId);
  const page = database.folders.listContent(
    parentFolderId,
    { cursor: input?.cursor, limit: input?.limit },
    checkedSort(input?.sort),
  );
  return Object.freeze({
    items: Object.freeze(
      page.items.map((value) => treeEntrySummary(database, value)),
    ),
    ...(page.nextCursor === undefined
      ? {}
      : { nextCursor: page.nextCursor }),
  });
}

export function createFolder(
  database: VaultDatabase,
  input: { readonly parentFolderId: unknown; readonly name: unknown },
  id: string,
  now: Timestamp,
): FolderSummary {
  const parentFolderId = asFolderId(input?.parentFolderId);
  const name = checkedName(input?.name);
  const folder = database.transaction((transaction) => {
    const parent = transaction.folders.get(parentFolderId);
    if (parent === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const created = createRegularFolder({
      id: asFolderId(id),
      vaultId: parent.vaultId,
      parentId: parent.id,
      name,
      sortOrder: asSortOrder(0),
      createdAt: now,
      updatedAt: now,
    });
    transaction.folders.insert(created);
    return created;
  });
  return folderSummary(database, folder);
}

export function renameFolder(
  database: VaultDatabase,
  input: { readonly folderId: unknown; readonly name: unknown },
  now: Timestamp,
): FolderSummary {
  const folderId = asFolderId(input?.folderId);
  const name = checkedName(input?.name);
  const renamed = database.transaction((transaction) => {
    const folder = transaction.folders.get(folderId);
    if (folder === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const result = renameDomainFolder(folder, name, now);
    transaction.folders.replace(result);
    return result;
  });
  return folderSummary(database, renamed);
}

export function moveFolder(
  database: VaultDatabase,
  input: { readonly folderId: unknown; readonly targetParentId: unknown },
  now: Timestamp,
): FolderSummary {
  const folderId = asFolderId(input?.folderId);
  const targetParentId = asFolderId(input?.targetParentId);
  const moved = database.transaction((transaction) => {
    const folder = transaction.folders.get(folderId);
    if (folder === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const targetParent = transaction.folders.get(targetParentId);
    if (targetParent === undefined) {
      throw new ApplicationError('PARENT_FOLDER_INVALID');
    }
    const result = moveDomainFolder({
      folder,
      targetParent,
      folders: transaction.folders.listAll(),
      sortOrder: folder.sortOrder,
      updatedAt: now,
    });
    transaction.folders.replace(result);
    return result;
  });
  return folderSummary(database, moved);
}
