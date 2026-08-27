import {
  asAdfDocument,
  asContentVersion,
  asFolderId,
  asNoteId,
  asSortOrder,
  asTrashEntryId,
  copyNote as copyDomainNote,
  createNote as createDomainNote,
  createNoteTag,
  moveNote as moveDomainNote,
  trashNote as trashDomainNote,
  updateNoteContent,
  type Timestamp,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import { AttachmentReferenceCoordinator } from '../local-attachments/references';
import type { Page, PageRequest } from '../types';
import { noteDetail, noteSummary } from './mapping';
import type { NoteDetail, NoteSummary } from './types';

const EMPTY_DOCUMENT = asAdfDocument({ type: 'doc', version: 1 });

function checkedTitle(value: unknown): string {
  if (typeof value !== 'string' || [...value].length > 1_000) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  return value;
}

export function createNote(
  database: VaultDatabase,
  input: { readonly folderId: unknown; readonly title?: unknown },
  id: string,
  now: Timestamp,
): NoteDetail {
  const folderId = asFolderId(input?.folderId);
  const title = checkedTitle(input?.title ?? '');
  const note = database.transaction((transaction) => {
    const folder = transaction.folders.get(folderId);
    if (folder === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const created = createDomainNote({
      id: asNoteId(id),
      vaultId: folder.vaultId,
      folderId: folder.id,
      title,
      document: EMPTY_DOCUMENT,
      sortOrder: asSortOrder(0),
      createdAt: now,
      updatedAt: now,
    });
    transaction.notes.insert(created);
    return created;
  });
  return noteDetail(database, note);
}

export function getActiveNoteEntity(database: VaultDatabase, value: unknown) {
  const noteId = asNoteId(value);
  const note = database.notes.get(noteId);
  if (note === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
  let cursor: string | undefined;
  do {
    const page = database.trash.list({
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (
      page.items.some((root) =>
        database.trash
          .listGroup(root.id)
          .some(
            (entry) =>
              entry.objectType === 'NOTE' && entry.objectId === note.id,
          ),
      )
    ) {
      throw new ApplicationError('ENTITY_NOT_FOUND');
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return note;
}

export function getNote(database: VaultDatabase, value: unknown): NoteDetail {
  return noteDetail(database, getActiveNoteEntity(database, value));
}

export function renameNote(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly title: unknown },
  now: Timestamp,
): NoteSummary {
  const noteId = asNoteId(input?.noteId);
  const title = checkedTitle(input?.title);
  const renamed = database.transaction((transaction) => {
    const current = getActiveNoteEntity(database, noteId);
    const next = updateNoteContent(current, {
      title,
      document: current.document,
      updatedAt: now,
    });
    transaction.notes.replaceContent(next, current.contentVersion);
    return next;
  });
  return noteSummary(renamed);
}

export function saveDraft(
  database: VaultDatabase,
  input: {
    readonly noteId: unknown;
    readonly expectedContentVersion: unknown;
    readonly title: unknown;
    readonly document: unknown;
  },
  now: Timestamp,
) {
  const noteId = asNoteId(input?.noteId);
  const expectedContentVersion = asContentVersion(
    input?.expectedContentVersion,
  );
  const title = checkedTitle(input?.title);
  const document = asAdfDocument(input?.document);
  const updated = database.transaction((transaction) => {
    const current = getActiveNoteEntity(database, noteId);
    const next = updateNoteContent(current, {
      title,
      document,
      updatedAt: now,
    });
    transaction.notes.replaceContent(next, expectedContentVersion);
    return next;
  });
  return Object.freeze({
    noteId: updated.id,
    contentVersion: updated.contentVersion,
    savedAt: now,
  });
}

export function moveNote(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly targetFolderId: unknown },
  now: Timestamp,
): NoteSummary {
  const noteId = asNoteId(input?.noteId);
  const targetFolderId = asFolderId(input?.targetFolderId);
  const moved = database.transaction((transaction) => {
    const current = getActiveNoteEntity(database, noteId);
    const targetFolder = transaction.folders.get(targetFolderId);
    if (targetFolder === undefined) {
      throw new ApplicationError('PARENT_FOLDER_INVALID');
    }
    const next = moveDomainNote({
      note: current,
      targetFolder,
      sortOrder: current.sortOrder,
      updatedAt: now,
    });
    transaction.notes.replaceLocation(next);
    return next;
  });
  return noteSummary(moved);
}

export function copyNote(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly targetFolderId: unknown },
  id: string,
  now: Timestamp,
): NoteSummary {
  const noteId = asNoteId(input?.noteId);
  const targetFolderId = asFolderId(input?.targetFolderId);
  const copied = database.transaction((transaction) => {
    const source = getActiveNoteEntity(database, noteId);
    const targetFolder = transaction.folders.get(targetFolderId);
    if (targetFolder === undefined) {
      throw new ApplicationError('PARENT_FOLDER_INVALID');
    }
    const noteTags = transaction.tags.listForNote(source.id).map((tag) =>
      createNoteTag({
        vaultId: source.vaultId,
        noteId: source.id,
        tagId: tag.id,
      }),
    );
    const newNoteId = asNoteId(id);
    const basePlan = copyDomainNote({
      source,
      newNoteId,
      targetFolder,
      sortOrder: source.sortOrder,
      noteTags,
      attachmentReferences: [],
      createdAt: now,
    });
    const plan = Object.freeze({
      ...basePlan,
      attachmentReferences: new AttachmentReferenceCoordinator(
        transaction.attachments,
      ).copyNotes([source.id], new Map([[source.id, newNoteId]])),
    });
    transaction.contentPlans.insertNoteCopy(plan);
    return plan.note;
  });
  return noteSummary(copied);
}

export function trashNote(
  database: VaultDatabase,
  value: unknown,
  entryId: string,
  now: Timestamp,
) {
  const noteId = asNoteId(value);
  const trashEntryId = asTrashEntryId(entryId);
  database.transaction((transaction) => {
    const note = transaction.notes.get(noteId);
    if (note === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const plan = trashDomainNote({ note, trashEntryId, deletedAt: now });
    transaction.trash.apply(plan);
    const references = new AttachmentReferenceCoordinator(
      transaction.attachments,
    ).moveNotesToTrash(new Map([[note.id, trashEntryId]]));
    transaction.attachments.removeReferences(references.remove);
    transaction.attachments.addReferences(references.add);
  });
  return Object.freeze({ trashEntryId });
}

export function listRecent(
  database: VaultDatabase,
  input: PageRequest,
): Page<NoteSummary> {
  const page = database.notes.listRecent({
    cursor: input?.cursor,
    limit: input?.limit,
  });
  return Object.freeze({
    items: Object.freeze(page.items.map(noteSummary)),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}
