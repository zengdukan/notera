import {
  asFolderId,
  asTrashEntryId,
  resolveTrashRestoreTarget,
  trashFolderTree,
  type Note,
  type Timestamp,
  type TrashEntry,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import { AttachmentReferenceCoordinator } from '../local-attachments/references';
import type { Page, PageRequest } from '../types';
import type { TrashItem } from './types';

function allNotesInFolder(
  database: VaultDatabase,
  folderId: ReturnType<typeof asFolderId>,
) {
  const notes: Note[] = [];
  let cursor: string | undefined;
  do {
    const page = database.notes.listByFolder(folderId, {
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    notes.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return notes;
}

function allTrashEntries(database: VaultDatabase): readonly TrashEntry[] {
  const entries: TrashEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = database.trash.list({
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    page.items.forEach((root) =>
      entries.push(...database.trash.listGroup(root.id)),
    );
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return entries;
}

function trashItem(database: VaultDatabase, entry: TrashEntry): TrashItem {
  let displayName: string;
  if (entry.objectType === 'FOLDER') {
    const folder = database.folders.get(entry.objectId);
    if (folder === undefined || folder.kind === 'ROOT') {
      throw new ApplicationError('ENTITY_NOT_FOUND');
    }
    displayName = folder.name;
  } else {
    const note = database.notes.get(entry.objectId);
    if (note === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    displayName = note.title;
  }
  return Object.freeze({
    trashEntryId: entry.id,
    objectId: entry.objectId,
    kind: entry.objectType === 'FOLDER' ? 'folder' : 'note',
    displayName,
    deletedAt: entry.deletedAt,
    expiresAt: entry.expiresAt,
    originalParentAvailable:
      database.folders.get(entry.originalParentId) !== undefined,
  });
}

export function trashFolder(
  database: VaultDatabase,
  value: unknown,
  randomId: () => string,
  now: Timestamp,
) {
  const folderId = asFolderId(value);
  database.folders.listContent(folderId, { limit: 1 });
  const folders = database.folders.listSubtree(folderId);
  const notes = folders.flatMap(({ id }) => allNotesInFolder(database, id));
  const folderTrashEntryIds = new Map(
    folders.map(({ id }) => [id, asTrashEntryId(randomId())]),
  );
  const noteTrashEntryIds = new Map(
    notes.map(({ id }) => [id, asTrashEntryId(randomId())]),
  );
  const plan = trashFolderTree({
    sourceFolderId: folderId,
    folders,
    notes,
    folderTrashEntryIds,
    noteTrashEntryIds,
    deletedAt: now,
  });
  database.transaction((transaction) => {
    transaction.trash.apply(plan);
    notes.forEach((note) => transaction.favorites.delete(note.id));
    const references = new AttachmentReferenceCoordinator(
      transaction.attachments,
    ).moveNotesToTrash(
      new Map(
        plan.entries
          .filter((entry) => entry.objectType === 'NOTE')
          .map((entry) => [entry.objectId as Note['id'], entry.id]),
      ),
    );
    transaction.attachments.removeReferences(references.remove);
    transaction.attachments.addReferences(references.add);
  });
  const root = plan.entries.find(({ objectId }) => objectId === folderId);
  if (root === undefined) throw new ApplicationError('OPERATION_FAILED');
  return Object.freeze({ trashEntryId: root.id });
}

export function listTrash(
  database: VaultDatabase,
  input: PageRequest,
): Page<TrashItem> {
  const page = database.trash.list({
    cursor: input?.cursor,
    limit: input?.limit,
  });
  return Object.freeze({
    items: Object.freeze(page.items.map((entry) => trashItem(database, entry))),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}

export function restoreTrash(
  database: VaultDatabase,
  input: { readonly trashEntryId: unknown; readonly targetFolderId?: unknown },
  now: Timestamp,
): void {
  const rootId = asTrashEntryId(input?.trashEntryId);
  const entries = database.trash.listGroup(rootId);
  if (entries.length === 0) throw new ApplicationError('ENTITY_NOT_FOUND');
  const root = entries.find(({ id }) => id === rootId);
  if (root === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
  const folders = database.folders.listAll();
  const trashedObjectIds = new Set(
    allTrashEntries(database).map(({ objectId }) => objectId),
  );
  const explicitTarget =
    input?.targetFolderId === undefined
      ? undefined
      : database.folders.get(asFolderId(input.targetFolderId));
  if (input?.targetFolderId !== undefined && explicitTarget === undefined) {
    throw new ApplicationError('PARENT_FOLDER_INVALID');
  }
  const rootTarget = resolveTrashRestoreTarget({
    entry: root,
    folders,
    trashedObjectIds,
    ...(explicitTarget === undefined ? {} : { explicitTarget }),
    now,
  });
  const targets = new Map(
    entries.map((entry) => [
      entry.id,
      entry.id === root.id ? rootTarget : entry.originalParentId,
    ]),
  );
  database.transaction((transaction) => {
    const references = new AttachmentReferenceCoordinator(
      transaction.attachments,
    ).restoreTrashEntries(
      new Map(
        entries
          .filter((entry) => entry.objectType === 'NOTE')
          .map((entry) => [entry.id, entry.objectId as Note['id']]),
      ),
    );
    transaction.attachments.removeReferences(references.remove);
    transaction.trash.restore({ entries, targetFolderIds: targets, now });
    transaction.attachments.addReferences(references.add);
  });
}

function versionIdsForNotes(
  database: VaultDatabase,
  noteIds: readonly Note['id'][],
) {
  return noteIds.flatMap((noteId) => {
    const result = [];
    let cursor: string | undefined;
    do {
      const page = database.history.listForNote(noteId, {
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      });
      result.push(...page.items.map(({ id }) => id));
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return result;
  });
}

function deleteEntries(
  database: VaultDatabase,
  entries: readonly TrashEntry[],
  now: Timestamp,
  mode: 'PERMANENT' | 'EXPIRED',
) {
  const noteIds = entries
    .filter((entry) => entry.objectType === 'NOTE')
    .map((entry) => entry.objectId as Note['id']);
  const versionIds = versionIdsForNotes(database, noteIds);
  const references = [
    ...database.attachments.listReferencesForNotes(noteIds),
    ...database.attachments.listReferencesForVersions(versionIds),
    ...database.attachments.listReferencesForTrashEntries(
      entries.map(({ id }) => id),
    ),
  ];
  const attachmentIds = [
    ...new Set(references.map(({ attachmentId }) => attachmentId)),
  ];
  const blobIds = database.transaction((transaction) => {
    transaction.attachments.removeReferences(references);
    if (mode === 'PERMANENT') transaction.trash.deletePermanent(entries);
    else transaction.trash.purgeExpired(entries);
    return transaction.attachments.deleteUnreferencedAttachments(
      attachmentIds,
      now,
    );
  });
  return Object.freeze({ deletedCount: entries.length, blobIds });
}

export function deleteTrashPermanent(
  database: VaultDatabase,
  value: unknown,
  now: Timestamp,
) {
  const entries = database.trash.listGroup(asTrashEntryId(value));
  if (entries.length === 0) throw new ApplicationError('ENTITY_NOT_FOUND');
  return deleteEntries(database, entries, now, 'PERMANENT');
}

export function purgeExpiredTrash(database: VaultDatabase, now: Timestamp) {
  const entries = database.trash.listExpiredGroups(now);
  return deleteEntries(database, entries, now, 'EXPIRED');
}
