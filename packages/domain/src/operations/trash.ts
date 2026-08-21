import { assertDomain, failDomain } from '../errors';
import type { FolderId, NoteId, TrashEntryId } from '../ids';
import type { Folder, RegularFolder } from '../models/folder';
import type { Note } from '../models/note';
import { createTrashEntry, type TrashEntry } from '../models/trash';
import { addTimestamp, type Timestamp } from '../values';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface TrashPlan {
  readonly entries: readonly TrashEntry[];
}

export interface TrashNoteInput {
  readonly note: Note;
  readonly trashEntryId: TrashEntryId;
  readonly deletedAt: Timestamp;
}

export function trashNote(input: TrashNoteInput): TrashPlan {
  const entry = createTrashEntry({
    id: input.trashEntryId,
    vaultId: input.note.vaultId,
    objectType: 'NOTE',
    objectId: input.note.id,
    originalParentId: input.note.folderId,
    deletedAt: input.deletedAt,
    expiresAt: addTimestamp(input.deletedAt, TRASH_RETENTION_MS),
  });
  return Object.freeze({ entries: Object.freeze([entry]) });
}

export interface TrashFolderTreeInput {
  readonly sourceFolderId: FolderId;
  readonly folders: readonly Folder[];
  readonly notes: readonly Note[];
  readonly folderTrashEntryIds: ReadonlyMap<FolderId, TrashEntryId>;
  readonly noteTrashEntryIds: ReadonlyMap<NoteId, TrashEntryId>;
  readonly deletedAt: Timestamp;
}

function collectSubtree(
  sourceFolderId: FolderId,
  folders: readonly Folder[],
  selected: ReadonlySet<FolderId> = new Set([sourceFolderId]),
): Set<FolderId> {
  const discovered = folders
    .filter(
      (folder) =>
        folder.kind === 'REGULAR' &&
        selected.has(folder.parentId) &&
        !selected.has(folder.id),
    )
    .map((folder) => folder.id);
  if (discovered.length === 0) {
    return new Set(selected);
  }
  return collectSubtree(
    sourceFolderId,
    folders,
    new Set([...selected, ...discovered]),
  );
}

function assertNoRestoreCycle(
  objectId: FolderId,
  target: Folder,
  folders: readonly Folder[],
  visited: ReadonlySet<FolderId> = new Set(),
): void {
  if (target.id === objectId || visited.has(target.id)) {
    failDomain('FOLDER_CYCLE');
  }
  if (target.kind === 'ROOT') {
    return;
  }
  const parent = folders.find((folder) => folder.id === target.parentId);
  if (parent) {
    assertNoRestoreCycle(
      objectId,
      parent,
      folders,
      new Set([...visited, target.id]),
    );
  }
}

export function trashFolderTree(input: TrashFolderTreeInput): TrashPlan {
  const source = input.folders.find(
    (folder) => folder.id === input.sourceFolderId,
  );
  assertDomain(source, 'ENTITY_NOT_FOUND');
  if (source.kind === 'ROOT') {
    failDomain('ROOT_FOLDER_IMMUTABLE');
  }
  const subtreeIds = collectSubtree(source.id, input.folders);
  const folders = input.folders.filter(
    (folder): folder is RegularFolder =>
      folder.kind === 'REGULAR' && subtreeIds.has(folder.id),
  );
  const notes = input.notes.filter((note) => subtreeIds.has(note.folderId));
  assertDomain(
    folders.every((folder) => folder.vaultId === source.vaultId) &&
      notes.every((note) => note.vaultId === source.vaultId),
    'VAULT_MISMATCH',
  );
  const mappedIds = [
    ...folders.map((folder) => input.folderTrashEntryIds.get(folder.id)),
    ...notes.map((note) => input.noteTrashEntryIds.get(note.id)),
  ];
  assertDomain(mappedIds.every(Boolean), 'ENTITY_NOT_FOUND');
  assertDomain(
    new Set(mappedIds).size === mappedIds.length,
    'DUPLICATE_TARGET_ID',
  );
  const expiresAt = addTimestamp(input.deletedAt, TRASH_RETENTION_MS);
  const folderEntries = folders.map((folder) =>
    createTrashEntry({
      id: input.folderTrashEntryIds.get(folder.id) as TrashEntryId,
      vaultId: folder.vaultId,
      objectType: 'FOLDER',
      objectId: folder.id,
      originalParentId: folder.parentId,
      deletedAt: input.deletedAt,
      expiresAt,
    }),
  );
  const noteEntries = notes.map((note) =>
    createTrashEntry({
      id: input.noteTrashEntryIds.get(note.id) as TrashEntryId,
      vaultId: note.vaultId,
      objectType: 'NOTE',
      objectId: note.id,
      originalParentId: note.folderId,
      deletedAt: input.deletedAt,
      expiresAt,
    }),
  );
  return Object.freeze({
    entries: Object.freeze([...folderEntries, ...noteEntries]),
  });
}

export function expiredTrashEntries(
  entries: readonly TrashEntry[],
  now: Timestamp,
): readonly TrashEntry[] {
  return Object.freeze(entries.filter((entry) => now >= entry.expiresAt));
}

export interface ResolveTrashRestoreTargetInput {
  readonly entry: TrashEntry;
  readonly folders: readonly Folder[];
  readonly trashedObjectIds: ReadonlySet<string>;
  readonly explicitTarget?: Folder;
  readonly now: Timestamp;
}

export function resolveTrashRestoreTarget(
  input: ResolveTrashRestoreTargetInput,
): FolderId {
  if (input.now >= input.entry.expiresAt) {
    failDomain('TRASH_ENTRY_EXPIRED');
  }
  const originalParent = input.folders.find(
    (folder) => folder.id === input.entry.originalParentId,
  );
  if (
    originalParent &&
    originalParent.vaultId === input.entry.vaultId &&
    !input.trashedObjectIds.has(originalParent.id)
  ) {
    return originalParent.id;
  }
  assertDomain(input.explicitTarget, 'TRASH_TARGET_REQUIRED');
  assertDomain(
    input.explicitTarget.vaultId === input.entry.vaultId,
    'VAULT_MISMATCH',
  );
  assertDomain(
    !input.trashedObjectIds.has(input.explicitTarget.id),
    'PARENT_FOLDER_INVALID',
  );
  if (input.entry.objectType === 'FOLDER') {
    assertNoRestoreCycle(
      input.entry.objectId,
      input.explicitTarget,
      input.folders,
    );
  }
  return input.explicitTarget.id;
}
