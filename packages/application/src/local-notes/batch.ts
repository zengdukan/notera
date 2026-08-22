import {
  asFolderId,
  asNoteId,
  asTagId,
  asTrashEntryId,
  copyFolderTree,
  copyNote,
  createNoteTag,
  moveFolder,
  moveNote,
  trashFolderTree,
  trashNote,
  type Folder,
  type Note,
  type NoteTag,
  type Timestamp,
  type TrashEntry,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import { AttachmentReferenceCoordinator } from '../local-attachments/references';
import { getActiveNoteEntity } from './notes';
import type { EntryRef } from './types';

function invalidState(): never {
  throw new ApplicationError('INVALID_ENTITY_STATE');
}

function unique<T>(values: readonly T[], maximum: number): void {
  if (values.length < 1 || values.length > maximum) invalidState();
  if (new Set(values).size !== values.length) {
    throw new ApplicationError('DUPLICATE_TARGET_ID');
  }
}

function trashedObjectIds(database: VaultDatabase): ReadonlySet<string> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = database.trash.list({
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    page.items.forEach((root) =>
      database.trash
        .listGroup(root.id)
        .forEach(({ objectId }) => ids.add(objectId)),
    );
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return ids;
}

function activeFolders(database: VaultDatabase): readonly Folder[] {
  const trashed = trashedObjectIds(database);
  return database.folders.listAll().filter(({ id }) => !trashed.has(id));
}

function notesInFolder(database: VaultDatabase, folderId: Folder['id']) {
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

function activeNotes(database: VaultDatabase, folders: readonly Folder[]) {
  return folders.flatMap(({ id }) => notesInFolder(database, id));
}

function normalizeTargets(
  database: VaultDatabase,
  values: readonly EntryRef[],
) {
  if (!Array.isArray(values)) invalidState();
  unique(
    values.map((value) => value?.id),
    500,
  );
  const folders = activeFolders(database);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const targets = values.map((value) => {
    if (value?.kind === 'folder') {
      const id = asFolderId(value.id);
      const folder = folderById.get(id);
      if (folder === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
      return Object.freeze({ kind: 'folder' as const, folder });
    }
    if (value?.kind === 'note') {
      return Object.freeze({
        kind: 'note' as const,
        note: getActiveNoteEntity(database, asNoteId(value.id)),
      });
    }
    return invalidState();
  });
  const selectedFolders = new Set(
    targets
      .filter((target) => target.kind === 'folder')
      .map((target) => target.folder.id),
  );
  targets.forEach((target) => {
    let cursor: Folder | undefined;
    if (target.kind === 'note') {
      cursor = folderById.get(target.note.folderId);
    } else if (target.folder.kind === 'REGULAR') {
      cursor = folderById.get(target.folder.parentId);
    }
    const visited = new Set<string>();
    while (cursor !== undefined) {
      if (selectedFolders.has(cursor.id)) invalidState();
      if (visited.has(cursor.id)) invalidState();
      visited.add(cursor.id);
      cursor =
        cursor.kind === 'ROOT' ? undefined : folderById.get(cursor.parentId);
    }
  });
  return { folders, folderById, targets };
}

function activeTargetFolder(value: unknown, folders: readonly Folder[]) {
  const id = asFolderId(value);
  const target = folders.find((folder) => folder.id === id);
  if (target === undefined) throw new ApplicationError('PARENT_FOLDER_INVALID');
  return target;
}

function checkedIds<T>(
  values: readonly unknown[],
  maximum: number,
  normalize: (value: unknown) => T,
): readonly T[] {
  if (!Array.isArray(values)) invalidState();
  const normalized = values.map(normalize);
  unique(normalized, maximum);
  return normalized;
}

export function batchMove(
  database: VaultDatabase,
  input: {
    readonly targets: readonly EntryRef[];
    readonly targetFolderId: unknown;
  },
  now: Timestamp,
): void {
  const normalized = normalizeTargets(database, input?.targets);
  const targetFolder = activeTargetFolder(
    input?.targetFolderId,
    normalized.folders,
  );
  const folders = normalized.targets
    .filter((target) => target.kind === 'folder')
    .map(({ folder }) =>
      moveFolder({
        folder,
        targetParent: targetFolder,
        folders: normalized.folders,
        sortOrder: folder.sortOrder,
        updatedAt: now,
      }),
    );
  const notes = normalized.targets
    .filter((target) => target.kind === 'note')
    .map(({ note }) =>
      moveNote({
        note,
        targetFolder,
        sortOrder: note.sortOrder,
        updatedAt: now,
      }),
    );
  database.transaction((transaction) =>
    transaction.contentPlans.applyBatchMove({ folders, notes }),
  );
}

function batchTags(
  database: VaultDatabase,
  input: {
    readonly noteIds: readonly unknown[];
    readonly tagIds: readonly unknown[];
  },
  operation: 'ADD' | 'REMOVE',
): void {
  const noteIds = checkedIds(input?.noteIds, 500, asNoteId);
  const tagIds = checkedIds(input?.tagIds, 100, asTagId);
  const notes = noteIds.map((id) => getActiveNoteEntity(database, id));
  const tags = tagIds.map((id) => {
    const tag = database.tags.get(id);
    if (tag === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    return tag;
  });
  const relations = notes.flatMap((note) =>
    tags.map((tag) =>
      createNoteTag({
        vaultId: note.vaultId,
        noteId: note.id,
        tagId: tag.id,
      }),
    ),
  );
  database.transaction((transaction) =>
    transaction.contentPlans.applyBatchRelations({
      add: operation === 'ADD' ? relations : [],
      remove: operation === 'REMOVE' ? relations : [],
    }),
  );
}

export function batchAddTags(
  database: VaultDatabase,
  input: {
    readonly noteIds: readonly unknown[];
    readonly tagIds: readonly unknown[];
  },
): void {
  batchTags(database, input, 'ADD');
}

export function batchRemoveTags(
  database: VaultDatabase,
  input: {
    readonly noteIds: readonly unknown[];
    readonly tagIds: readonly unknown[];
  },
): void {
  batchTags(database, input, 'REMOVE');
}

function noteTags(database: VaultDatabase, note: Note): readonly NoteTag[] {
  return database.tags
    .listForNote(note.id)
    .map((tag) =>
      createNoteTag({ vaultId: note.vaultId, noteId: note.id, tagId: tag.id }),
    );
}

export function batchCopy(
  database: VaultDatabase,
  input: {
    readonly targets: readonly EntryRef[];
    readonly targetFolderId: unknown;
  },
  randomId: () => string,
  now: Timestamp,
): void {
  const normalized = normalizeTargets(database, input?.targets);
  const targetFolder = activeTargetFolder(
    input?.targetFolderId,
    normalized.folders,
  );
  const notes = activeNotes(database, normalized.folders);
  const folderPlans = normalized.targets
    .filter((target) => target.kind === 'folder')
    .map(({ folder }) => {
      const subtree = normalized.folders.filter((candidate) => {
        let cursor: Folder | undefined = candidate;
        while (cursor !== undefined) {
          if (cursor.id === folder.id) return true;
          cursor =
            cursor.kind === 'ROOT'
              ? undefined
              : normalized.folderById.get(cursor.parentId);
        }
        return false;
      });
      const subtreeIds = new Set(subtree.map(({ id }) => id));
      const subtreeNotes = notes.filter((note) =>
        subtreeIds.has(note.folderId),
      );
      const noteIdMap = new Map(
        subtreeNotes.map(({ id }) => [id, asNoteId(randomId())]),
      );
      return {
        noteIdMap,
        plan: copyFolderTree({
        sourceFolderId: folder.id,
        targetParent: targetFolder,
        folders: normalized.folders,
        notes,
        noteTags: subtreeNotes.flatMap((note) => noteTags(database, note)),
        attachmentReferences: [],
        folderIdMap: new Map(
          subtree.map(({ id }) => [id, asFolderId(randomId())]),
        ),
        noteIdMap,
        createdAt: now,
        }),
      };
    });
  const notePlans = normalized.targets
    .filter((target) => target.kind === 'note')
    .map(({ note }) => {
      const newNoteId = asNoteId(randomId());
      return {
        sourceNoteId: note.id,
        newNoteId,
        plan: copyNote({
        source: note,
        newNoteId,
        targetFolder,
        sortOrder: note.sortOrder,
        noteTags: noteTags(database, note),
        attachmentReferences: [],
        createdAt: now,
        }),
      };
    });
  const targetNoteIdMap = new Map([
    ...folderPlans.flatMap(({ noteIdMap }) => [...noteIdMap]),
    ...notePlans.map(({ sourceNoteId, newNoteId }) => [
      sourceNoteId,
      newNoteId,
    ] as const),
  ]);
  const copiedReferences = new AttachmentReferenceCoordinator(
    database.attachments,
  ).copyNotes([...targetNoteIdMap.keys()], targetNoteIdMap);
  database.transaction((transaction) => {
    folderPlans.forEach(({ plan, noteIdMap }) => {
      const targetIds = new Set(noteIdMap.values());
      transaction.contentPlans.insertFolderTreeCopy(
        Object.freeze({
          ...plan,
          attachmentReferences: Object.freeze(
            copiedReferences.filter((reference) =>
              targetIds.has(reference.noteId),
            ),
          ),
        }),
      );
    });
    notePlans.forEach(({ plan, newNoteId }) =>
      transaction.contentPlans.insertNoteCopy(
        Object.freeze({
          ...plan,
          attachmentReferences: Object.freeze(
            copiedReferences.filter(
              (reference) => reference.noteId === newNoteId,
            ),
          ),
        }),
      ),
    );
  });
}

export function batchTrash(
  database: VaultDatabase,
  input: { readonly targets: readonly EntryRef[] },
  randomId: () => string,
  now: Timestamp,
) {
  const normalized = normalizeTargets(database, input?.targets);
  const notes = activeNotes(database, normalized.folders);
  const plans = normalized.targets.map((target) => {
    if (target.kind === 'note') {
      return trashNote({
        note: target.note,
        trashEntryId: asTrashEntryId(randomId()),
        deletedAt: now,
      });
    }
    const subtreeIds = new Set(
      normalized.folders
        .filter((folder) => {
          let cursor: Folder | undefined = folder;
          while (cursor !== undefined) {
            if (cursor.id === target.folder.id) return true;
            cursor =
              cursor.kind === 'ROOT'
                ? undefined
                : normalized.folderById.get(cursor.parentId);
          }
          return false;
        })
        .map(({ id }) => id),
    );
    const subtreeNotes = notes.filter((note) => subtreeIds.has(note.folderId));
    return trashFolderTree({
      sourceFolderId: target.folder.id,
      folders: normalized.folders,
      notes,
      folderTrashEntryIds: new Map(
        [...subtreeIds].map((id) => [id, asTrashEntryId(randomId())]),
      ),
      noteTrashEntryIds: new Map(
        subtreeNotes.map(({ id }) => [id, asTrashEntryId(randomId())]),
      ),
      deletedAt: now,
    });
  });
  const entries: TrashEntry[] = plans.flatMap((plan) => plan.entries);
  const rootIds = normalized.targets.map((target, index) => {
    const objectId =
      target.kind === 'folder' ? target.folder.id : target.note.id;
    const root = plans[index].entries.find(
      (entry) => entry.objectId === objectId,
    );
    if (root === undefined) return invalidState();
    return root.id;
  });
  database.transaction((transaction) => transaction.trash.apply({ entries }));
  return Object.freeze({ trashEntryIds: Object.freeze(rootIds) });
}
