import type { AttachmentId, NoteId, Timestamp } from '@notera/domain';
import type { Page } from '../types';

export type AttachmentAvailability = 'AVAILABLE' | 'MISSING' | 'CORRUPT';

export interface AttachmentSummary {
  readonly id: AttachmentId;
  readonly fileName: string;
  readonly mime: string;
  readonly byteLength: number;
  readonly localState: AttachmentAvailability;
  readonly previewable: boolean;
  readonly createdAt: Timestamp;
}

export interface ImportAttachmentInput {
  readonly noteId: NoteId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly source: AsyncIterable<Uint8Array>;
  readonly signal?: AbortSignal;
}

export interface ListAttachmentsForNoteInput {
  readonly noteId: NoteId;
  readonly cursor?: string;
  readonly limit: number;
}

export interface AttachmentContentReader {
  readonly attachmentId: AttachmentId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
  stream(): AsyncIterable<Uint8Array>;
  streamRange(start: number, endExclusive: number): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}

export interface LocalAttachmentsService {
  importAttachment(input: ImportAttachmentInput): Promise<AttachmentSummary>;
  listForNote(
    input: ListAttachmentsForNoteInput,
  ): Promise<Page<AttachmentSummary>>;
  openReader(attachmentId: AttachmentId): Promise<AttachmentContentReader>;
}
