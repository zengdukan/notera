import type { FolderId, VaultId } from '../ids';
import { asSortOrder, type FolderName, type SortOrder, type Timestamp } from '../values';
import { assertTimestampOrder, immutable } from './common';

interface FolderBase {
  readonly id: FolderId;
  readonly vaultId: VaultId;
  readonly sortOrder: SortOrder;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface RootFolder extends FolderBase {
  readonly kind: 'ROOT';
  readonly parentId: null;
}

export interface RegularFolder extends FolderBase {
  readonly kind: 'REGULAR';
  readonly parentId: FolderId;
  readonly name: FolderName;
}

export type Folder = RootFolder | RegularFolder;

export interface CreateRootFolderInput {
  readonly id: FolderId;
  readonly vaultId: VaultId;
  readonly createdAt: Timestamp;
}

export function createRootFolder(input: CreateRootFolderInput): RootFolder {
  return immutable({
    id: input.id,
    vaultId: input.vaultId,
    kind: 'ROOT' as const,
    parentId: null,
    sortOrder: asSortOrder(0),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export interface CreateRegularFolderInput extends Omit<RegularFolder, 'kind'> {}

export function createRegularFolder(
  input: CreateRegularFolderInput,
): RegularFolder {
  assertTimestampOrder(input.createdAt, input.updatedAt);
  return immutable({ ...input, kind: 'REGULAR' as const });
}
