import {
  asFolderId,
  asFolderName,
  asSortOrder,
  asTimestamp,
  asVaultId,
  createRegularFolder,
  createRootFolder,
  type Folder,
} from '@notera/domain';

import { StorageError } from '../errors';

export interface FolderRow {
  readonly id: unknown;
  readonly vault_id: unknown;
  readonly kind: unknown;
  readonly parent_id: unknown;
  readonly name: unknown;
  readonly sort_order: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

export function hydrateFolder(row: FolderRow): Folder {
  try {
    const id = asFolderId(row.id);
    const vaultId = asVaultId(row.vault_id);
    const sortOrder = asSortOrder(row.sort_order);
    const createdAt = asTimestamp(row.created_at);
    const updatedAt = asTimestamp(row.updated_at);

    if (
      row.kind === 'ROOT' &&
      row.parent_id === null &&
      row.name === null &&
      sortOrder === 0 &&
      createdAt === updatedAt
    ) {
      return createRootFolder({ id, vaultId, createdAt });
    }
    if (
      row.kind === 'REGULAR' &&
      typeof row.parent_id === 'string' &&
      typeof row.name === 'string'
    ) {
      return createRegularFolder({
        id,
        vaultId,
        parentId: asFolderId(row.parent_id),
        name: asFolderName(row.name),
        sortOrder,
        createdAt,
        updatedAt,
      });
    }
  } catch {
    // All malformed persisted rows collapse to the stable corruption code.
  }
  throw new StorageError('DB_CORRUPT');
}
