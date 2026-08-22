import {
  asContentVersion,
  asFolderId,
  asNoteId,
  asNoteVersionId,
  asSortOrder,
  asVersionName,
  copyNote as copyDomainNote,
  createUserVersion,
  renameUserVersion,
  restoreNoteVersion,
  type Note,
  type NoteVersion,
  type Timestamp,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type { Page } from '../types';
import { historySummary, noteSummary } from './mapping';
import { getActiveNoteEntity } from './notes';
import type {
  HistoryComparison,
  HistoryRestoreResult,
  HistorySnapshot,
  HistorySummary,
  NoteSummary,
  VersionRef,
} from './types';

function checkedVersionName(value: unknown) {
  if (typeof value !== 'string' || [...value.trim()].length > 100) {
    throw new ApplicationError('INVALID_NAME');
  }
  return asVersionName(value);
}

function versionForNote(
  database: VaultDatabase,
  noteId: ReturnType<typeof asNoteId>,
  value: unknown,
): NoteVersion {
  const version = database.history.get(asNoteVersionId(value));
  if (version === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
  if (version.noteId !== noteId) {
    throw new ApplicationError('VERSION_NOTE_MISMATCH');
  }
  return version;
}

function snapshotFromNote(note: Note): HistorySnapshot {
  return Object.freeze({
    ref: Object.freeze({ source: 'CURRENT' as const }),
    noteId: note.id,
    title: note.title,
    document: note.document,
    createdAt: note.updatedAt,
  });
}

function snapshotFromVersion(version: NoteVersion): HistorySnapshot {
  return Object.freeze({
    ref: Object.freeze({
      source: 'VERSION' as const,
      versionId: version.id,
    }),
    noteId: version.noteId,
    title: version.title,
    document: version.document,
    createdAt: version.createdAt,
  });
}

function resolveSnapshot(
  database: VaultDatabase,
  note: Note,
  ref: VersionRef,
): HistorySnapshot {
  if (ref?.source === 'CURRENT') return snapshotFromNote(note);
  if (ref?.source === 'VERSION') {
    return snapshotFromVersion(versionForNote(database, note.id, ref.versionId));
  }
  throw new ApplicationError('OPERATION_FAILED');
}

export function listHistory(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly cursor?: string; readonly limit: number },
): Page<HistorySummary> {
  const note = getActiveNoteEntity(database, input?.noteId);
  const page = database.history.listForNote(note.id, {
    cursor: input?.cursor,
    limit: input?.limit,
  });
  return Object.freeze({
    items: Object.freeze(page.items.map(historySummary)),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}

export function getHistory(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly versionId: unknown },
): HistorySnapshot {
  const noteId = asNoteId(input?.noteId);
  getActiveNoteEntity(database, noteId);
  return snapshotFromVersion(versionForNote(database, noteId, input?.versionId));
}

export function createPermanentVersion(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly versionName?: unknown },
  id: string,
  now: Timestamp,
): HistorySummary {
  const note = getActiveNoteEntity(database, input?.noteId);
  const version = createUserVersion(
    note,
    asNoteVersionId(id),
    now,
    input?.versionName === undefined
      ? null
      : checkedVersionName(input.versionName),
  );
  database.transaction((transaction) => transaction.history.insert(version));
  return historySummary(version);
}

export function renameHistoryVersion(
  database: VaultDatabase,
  input: {
    readonly noteId: unknown;
    readonly versionId: unknown;
    readonly versionName: unknown;
  },
): HistorySummary {
  const noteId = asNoteId(input?.noteId);
  getActiveNoteEntity(database, noteId);
  const version = versionForNote(database, noteId, input?.versionId);
  const versionName =
    input?.versionName === null
      ? null
      : checkedVersionName(input?.versionName);
  const renamed = renameUserVersion(version, versionName);
  const stored = database.transaction((transaction) =>
    transaction.history.rename(noteId, renamed.id, renamed.versionName),
  );
  return historySummary(stored);
}

export function compareHistory(
  database: VaultDatabase,
  input: {
    readonly noteId: unknown;
    readonly left: VersionRef;
    readonly right: VersionRef;
  },
): HistoryComparison {
  const note = getActiveNoteEntity(database, input?.noteId);
  return Object.freeze({
    left: resolveSnapshot(database, note, input?.left),
    right: resolveSnapshot(database, note, input?.right),
  });
}

export function restoreHistory(
  database: VaultDatabase,
  input: {
    readonly noteId: unknown;
    readonly versionId: unknown;
    readonly expectedContentVersion: unknown;
  },
  protectionId: string,
  now: Timestamp,
): HistoryRestoreResult {
  const noteId = asNoteId(input?.noteId);
  const expected = asContentVersion(input?.expectedContentVersion);
  return database.transaction((transaction) => {
    const note = transaction.notes.get(noteId);
    if (note === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const version = transaction.history.get(asNoteVersionId(input?.versionId));
    if (version === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const plan = restoreNoteVersion({
      note,
      version,
      protectionVersionId: asNoteVersionId(protectionId),
      restoredAt: now,
    });
    transaction.history.restore(
      version,
      plan.protectionVersion,
      plan.note,
      expected,
    );
    return Object.freeze({
      noteId: plan.note.id,
      contentVersion: plan.note.contentVersion,
      protectionVersionId: plan.protectionVersion.id,
    });
  });
}

export function copyHistory(
  database: VaultDatabase,
  input: {
    readonly noteId: unknown;
    readonly versionId: unknown;
    readonly targetFolderId: unknown;
  },
  id: string,
  now: Timestamp,
): NoteSummary {
  const noteId = asNoteId(input?.noteId);
  const version = versionForNote(database, noteId, input?.versionId);
  const targetFolderId = asFolderId(input?.targetFolderId);
  const copied = database.transaction((transaction) => {
    const targetFolder = transaction.folders.get(targetFolderId);
    if (targetFolder === undefined) {
      throw new ApplicationError('PARENT_FOLDER_INVALID');
    }
    const source = getActiveNoteEntity(database, noteId);
    const plan = copyDomainNote({
      source: { ...source, title: version.title, document: version.document },
      newNoteId: asNoteId(id),
      targetFolder,
      sortOrder: asSortOrder(0),
      noteTags: [],
      attachmentReferences: [],
      createdAt: now,
    });
    transaction.contentPlans.insertNoteCopy(plan);
    return plan.note;
  });
  return noteSummary(copied);
}
