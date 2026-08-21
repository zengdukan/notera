import { assertDomain, failDomain } from '../errors';
import type { FolderId, NoteId } from '../ids';
import {
  createCurrentNoteAttachmentReference,
  type AttachmentReference,
  type CurrentNoteAttachmentReference,
} from '../models/attachment';
import {
  createRegularFolder,
  type Folder,
  type RegularFolder,
} from '../models/folder';
import { createNote, type Note } from '../models/note';
import { createNoteTag, type NoteTag } from '../models/tag';
import type { SortOrder, Timestamp } from '../values';

function immutableArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

export interface NoteCopyPlan {
  readonly note: Note;
  readonly noteTags: readonly NoteTag[];
  readonly attachmentReferences: readonly CurrentNoteAttachmentReference[];
}

export interface CopyNoteInput {
  readonly source: Note;
  readonly newNoteId: NoteId;
  readonly targetFolder: Folder;
  readonly sortOrder: SortOrder;
  readonly noteTags: readonly NoteTag[];
  readonly attachmentReferences: readonly AttachmentReference[];
  readonly createdAt: Timestamp;
}

export function copyNote(input: CopyNoteInput): NoteCopyPlan {
  assertDomain(
    input.source.vaultId === input.targetFolder.vaultId,
    'VAULT_MISMATCH',
  );
  assertDomain(input.newNoteId !== input.source.id, 'DUPLICATE_TARGET_ID');

  const copiedNote = createNote({
    id: input.newNoteId,
    vaultId: input.source.vaultId,
    folderId: input.targetFolder.id,
    title: input.source.title,
    document: input.source.document,
    sortOrder: input.sortOrder,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  const copiedTags = input.noteTags
    .filter((item) => item.noteId === input.source.id)
    .map((item) => {
      assertDomain(item.vaultId === input.source.vaultId, 'VAULT_MISMATCH');
      return createNoteTag({ ...item, noteId: input.newNoteId });
    });
  const copiedReferences = input.attachmentReferences
    .filter(
      (item): item is CurrentNoteAttachmentReference =>
        item.source === 'NOTE' && item.noteId === input.source.id,
    )
    .map((item) => {
      assertDomain(item.vaultId === input.source.vaultId, 'VAULT_MISMATCH');
      return createCurrentNoteAttachmentReference({
        vaultId: item.vaultId,
        attachmentId: item.attachmentId,
        noteId: input.newNoteId,
      });
    });

  return Object.freeze({
    note: copiedNote,
    noteTags: immutableArray(copiedTags),
    attachmentReferences: immutableArray(copiedReferences),
  });
}

export interface FolderTreeCopyPlan {
  readonly folders: readonly RegularFolder[];
  readonly notes: readonly Note[];
  readonly noteTags: readonly NoteTag[];
  readonly attachmentReferences: readonly CurrentNoteAttachmentReference[];
}

export interface CopyFolderTreeInput {
  readonly sourceFolderId: FolderId;
  readonly targetParent: Folder;
  readonly folders: readonly Folder[];
  readonly notes: readonly Note[];
  readonly noteTags: readonly NoteTag[];
  readonly attachmentReferences: readonly AttachmentReference[];
  readonly folderIdMap: ReadonlyMap<FolderId, FolderId>;
  readonly noteIdMap: ReadonlyMap<NoteId, NoteId>;
  readonly createdAt: Timestamp;
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

function assertUniqueTargetIds(
  input: CopyFolderTreeInput,
  selectedFolders: readonly Folder[],
  selectedNotes: readonly Note[],
): void {
  const targetIds = [
    ...selectedFolders.map((folder) => input.folderIdMap.get(folder.id)),
    ...selectedNotes.map((note) => input.noteIdMap.get(note.id)),
  ].filter((id): id is FolderId | NoteId => id !== undefined);
  const existingIds = new Set<string>([
    ...input.folders.map((folder) => folder.id),
    ...input.notes.map((note) => note.id),
  ]);
  targetIds.reduce<Set<string>>((unique, id) => {
    if (unique.has(id) || existingIds.has(id)) {
      failDomain('DUPLICATE_TARGET_ID');
    }
    unique.add(id);
    return unique;
  }, new Set());
}

export function copyFolderTree(input: CopyFolderTreeInput): FolderTreeCopyPlan {
  const source = input.folders.find(
    (folder) => folder.id === input.sourceFolderId,
  );
  assertDomain(source, 'ENTITY_NOT_FOUND');
  if (source.kind === 'ROOT') {
    failDomain('ROOT_FOLDER_IMMUTABLE');
  }
  assertDomain(source.vaultId === input.targetParent.vaultId, 'VAULT_MISMATCH');

  const subtreeIds = collectSubtree(source.id, input.folders);
  const selectedFolders = input.folders.filter(
    (folder): folder is RegularFolder =>
      folder.kind === 'REGULAR' && subtreeIds.has(folder.id),
  );
  const selectedNotes = input.notes.filter((item) =>
    subtreeIds.has(item.folderId),
  );
  assertUniqueTargetIds(input, selectedFolders, selectedNotes);
  assertDomain(
    selectedFolders.every((folder) => input.folderIdMap.has(folder.id)) &&
      selectedNotes.every((item) => input.noteIdMap.has(item.id)),
    'ENTITY_NOT_FOUND',
  );

  const copiedFolders = selectedFolders.map((folder) => {
    const id = input.folderIdMap.get(folder.id);
    assertDomain(id, 'ENTITY_NOT_FOUND');
    const parentId =
      folder.id === source.id
        ? input.targetParent.id
        : input.folderIdMap.get(folder.parentId);
    assertDomain(parentId, 'ENTITY_NOT_FOUND');
    return createRegularFolder({
      ...folder,
      id,
      parentId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  });
  const copiedPlans = selectedNotes.map((item) => {
    const newNoteId = input.noteIdMap.get(item.id);
    const targetFolderId = input.folderIdMap.get(item.folderId);
    const targetFolder = copiedFolders.find(
      (folder) => folder.id === targetFolderId,
    );
    assertDomain(newNoteId && targetFolder, 'ENTITY_NOT_FOUND');
    return copyNote({
      source: item,
      newNoteId,
      targetFolder,
      sortOrder: item.sortOrder,
      noteTags: input.noteTags,
      attachmentReferences: input.attachmentReferences,
      createdAt: input.createdAt,
    });
  });

  return Object.freeze({
    folders: immutableArray(copiedFolders),
    notes: immutableArray(copiedPlans.map((plan) => plan.note)),
    noteTags: immutableArray(copiedPlans.flatMap((plan) => plan.noteTags)),
    attachmentReferences: immutableArray(
      copiedPlans.flatMap((plan) => plan.attachmentReferences),
    ),
  });
}
