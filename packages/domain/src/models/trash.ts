import { assertDomain } from '../errors';
import type { FolderId, NoteId, TrashEntryId, VaultId } from '../ids';
import { asFolderName, type Timestamp } from '../values';
import { immutable } from './common';

interface TrashEntryBase {
  readonly id: TrashEntryId;
  readonly vaultId: VaultId;
  readonly displayName: string;
  readonly originalParentId: FolderId;
  readonly deletedAt: Timestamp;
  readonly expiresAt: Timestamp;
}

export interface NoteTrashEntry extends TrashEntryBase {
  readonly objectType: 'NOTE';
  readonly objectId: NoteId;
}

export interface FolderTrashEntry extends TrashEntryBase {
  readonly objectType: 'FOLDER';
  readonly objectId: FolderId;
}

export type TrashEntry = NoteTrashEntry | FolderTrashEntry;

export function createTrashEntry(input: TrashEntry): TrashEntry {
  assertDomain(typeof input.displayName === 'string', 'INVALID_NAME');
  if (input.objectType === 'FOLDER') asFolderName(input.displayName);
  assertDomain(input.expiresAt >= input.deletedAt, 'INVALID_TIMESTAMP');
  return immutable(input);
}
