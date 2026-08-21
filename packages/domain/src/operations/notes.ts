import { asAdfDocument, type AdfDocument } from '../adf';
import { assertDomain } from '../errors';
import type { Folder } from '../models/folder';
import { rehydrateNote, type Note } from '../models/note';
import {
  nextContentVersion,
  type SortOrder,
  type Timestamp,
} from '../values';

export interface UpdateNoteContentInput {
  readonly title: string;
  readonly document: AdfDocument;
  readonly updatedAt: Timestamp;
}

export function updateNoteContent(
  note: Note,
  input: UpdateNoteContentInput,
): Note {
  return rehydrateNote({
    ...note,
    title: input.title,
    document: asAdfDocument(input.document),
    contentVersion: nextContentVersion(note.contentVersion),
    updatedAt: input.updatedAt,
  });
}

export interface MoveNoteInput {
  readonly note: Note;
  readonly targetFolder: Folder;
  readonly sortOrder: SortOrder;
  readonly updatedAt: Timestamp;
}

export function moveNote(input: MoveNoteInput): Note {
  assertDomain(
    input.note.vaultId === input.targetFolder.vaultId,
    'VAULT_MISMATCH',
  );
  return rehydrateNote({
    ...input.note,
    folderId: input.targetFolder.id,
    sortOrder: input.sortOrder,
    updatedAt: input.updatedAt,
  });
}
