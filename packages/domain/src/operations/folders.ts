import { assertDomain, failDomain } from '../errors';
import type { FolderId } from '../ids';
import {
  createRegularFolder,
  type Folder,
  type RegularFolder,
} from '../models/folder';
import type { FolderName, SortOrder, Timestamp } from '../values';

export function renameFolder(
  folder: Folder,
  name: FolderName,
  updatedAt: Timestamp,
): RegularFolder {
  if (folder.kind === 'ROOT') {
    failDomain('ROOT_FOLDER_IMMUTABLE');
  }
  return createRegularFolder({ ...folder, name, updatedAt });
}

function indexFolders(folders: readonly Folder[]): Map<FolderId, Folder> {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

export interface MoveFolderInput {
  readonly folder: Folder;
  readonly targetParent: Folder;
  readonly folders: readonly Folder[];
  readonly sortOrder: SortOrder;
  readonly updatedAt: Timestamp;
}

export function moveFolder(input: MoveFolderInput): RegularFolder {
  if (input.folder.kind === 'ROOT') {
    failDomain('ROOT_FOLDER_IMMUTABLE');
  }
  assertDomain(
    input.folder.vaultId === input.targetParent.vaultId,
    'VAULT_MISMATCH',
  );
  const byId = indexFolders(input.folders);
  assertDomain(
    byId.has(input.folder.id) && byId.has(input.targetParent.id),
    'PARENT_FOLDER_INVALID',
  );

  let cursor: Folder | undefined = input.targetParent;
  const visited = new Set<FolderId>();
  while (cursor) {
    if (cursor.id === input.folder.id) {
      failDomain('FOLDER_CYCLE');
    }
    if (visited.has(cursor.id)) {
      failDomain('FOLDER_CYCLE');
    }
    visited.add(cursor.id);
    if (cursor.kind === 'ROOT') {
      break;
    }
    cursor = byId.get(cursor.parentId);
    assertDomain(cursor, 'PARENT_FOLDER_INVALID');
  }

  return createRegularFolder({
    ...input.folder,
    parentId: input.targetParent.id,
    sortOrder: input.sortOrder,
    updatedAt: input.updatedAt,
  });
}
