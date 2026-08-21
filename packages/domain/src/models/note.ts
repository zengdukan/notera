import { asAdfDocument, type AdfDocument } from '../adf';
import type { FolderId, NoteId, VaultId } from '../ids';
import {
  asContentVersion,
  type ContentVersion,
  type SortOrder,
  type Timestamp,
} from '../values';
import { assertTimestampOrder, immutable } from './common';

export interface Note {
  readonly id: NoteId;
  readonly vaultId: VaultId;
  readonly folderId: FolderId;
  readonly title: string;
  readonly document: AdfDocument;
  readonly contentVersion: ContentVersion;
  readonly sortOrder: SortOrder;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export type CreateNoteInput = Omit<Note, 'contentVersion'>;

export function createNote(input: CreateNoteInput): Note {
  return rehydrateNote({ ...input, contentVersion: asContentVersion(1) });
}

export function rehydrateNote(input: Note): Note {
  assertTimestampOrder(input.createdAt, input.updatedAt);
  return immutable({ ...input, document: asAdfDocument(input.document) });
}
