import {
  asAttachmentId,
  asNoteId,
  type AttachmentId,
  type NoteId,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type {
  ImportAttachmentInput,
  ListAttachmentsForNoteInput,
} from './types';

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') throw new ApplicationError('INVALID_NAME');
  const normalized = value.trim();
  if ([...normalized].length < 1 || [...normalized].length > 255) {
    throw new ApplicationError('INVALID_NAME');
  }
  return normalized;
}

export function normalizeAttachmentId(value: unknown): AttachmentId {
  try {
    return asAttachmentId(value);
  } catch {
    throw new ApplicationError('ENTITY_NOT_FOUND');
  }
}

export function normalizeNoteId(value: unknown): NoteId {
  try {
    return asNoteId(value);
  } catch {
    throw new ApplicationError('ENTITY_NOT_FOUND');
  }
}

export function validateImportInput(value: ImportAttachmentInput) {
  if (typeof value !== 'object' || value === null) {
    throw new ApplicationError('ATTACHMENT_IMPORT_FAILED');
  }
  const noteId = normalizeNoteId(value.noteId);
  const fileName = normalizeText(value.fileName);
  const mimeType = normalizeText(value.mimeType);
  if (
    typeof value.source !== 'object' ||
    value.source === null ||
    typeof value.source[Symbol.asyncIterator] !== 'function' ||
    (value.signal !== undefined && !(value.signal instanceof AbortSignal))
  ) {
    throw new ApplicationError('ATTACHMENT_IMPORT_FAILED');
  }
  return Object.freeze({
    noteId,
    fileName,
    mimeType,
    source: value.source,
    ...(value.signal === undefined ? {} : { signal: value.signal }),
  });
}

export function validateListInput(value: ListAttachmentsForNoteInput) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Number.isSafeInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 100 ||
    (value.cursor !== undefined &&
      (typeof value.cursor !== 'string' || value.cursor.length === 0))
  ) {
    throw new ApplicationError('INVALID_CURSOR');
  }
  return Object.freeze({
    noteId: normalizeNoteId(value.noteId),
    limit: value.limit,
    ...(value.cursor === undefined ? {} : { cursor: value.cursor }),
  });
}

function noteIsTrashed(database: VaultDatabase, noteId: NoteId): boolean {
  let cursor: string | undefined;
  do {
    const page = database.trash.list({
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    for (const root of page.items) {
      if (
        database.trash
          .listGroup(root.id)
          .some(
            (entry) =>
              entry.objectType === 'NOTE' && entry.objectId === noteId,
          )
      ) {
        return true;
      }
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return false;
}

export function requireActiveNote(
  database: VaultDatabase,
  noteId: NoteId,
): void {
  if (database.notes.get(noteId) === undefined || noteIsTrashed(database, noteId)) {
    throw new ApplicationError('ENTITY_NOT_FOUND');
  }
}

export function combineSignals(
  signals: readonly (AbortSignal | undefined)[],
): { readonly signal: AbortSignal; cleanup(): void } {
  const controller = new AbortController();
  const active = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  const abort = () => controller.abort();
  active.forEach((signal) => {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  return {
    signal: controller.signal,
    cleanup() {
      active.forEach((signal) => signal.removeEventListener('abort', abort));
    },
  };
}
