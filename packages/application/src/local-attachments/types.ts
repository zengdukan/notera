import type { AttachmentId, NoteId, Timestamp } from '@notera/domain';

interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: string;
}

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
  readonly attachmentId?: AttachmentId;
  readonly noteId: NoteId;
  readonly reference?:
    | { readonly kind: 'CURRENT_NOTE' }
    | { readonly kind: 'UPLOAD'; readonly expiresAt: Timestamp };
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

export interface AttachmentGcReport {
  readonly scannedCount: number;
  readonly collectedCount: number;
  readonly retryCount: number;
}

export interface AttachmentRecoveryReport {
  readonly missingCount: number;
  readonly collectedGcCount: number;
  readonly collectedOrphanCount: number;
  readonly retryCount: number;
  readonly unexpectedEntryCount: number;
}

export interface LocalAttachmentsService {
  importAttachment(input: ImportAttachmentInput): Promise<AttachmentSummary>;
  listForNote(
    input: ListAttachmentsForNoteInput,
  ): Promise<Page<AttachmentSummary>>;
  openReader(
    attachmentId: AttachmentId,
    noteId?: NoteId,
  ): Promise<AttachmentContentReader>;
  removeFromNote(input: {
    readonly noteId: NoteId;
    readonly attachmentId: AttachmentId;
  }): Promise<void>;
  collectGarbage(): Promise<AttachmentGcReport>;
}
