import { assertDomain } from '../errors';
import type {
  AttachmentId,
  BlobId,
  NoteId,
  NoteVersionId,
  TrashEntryId,
  VaultId,
} from '../ids';
import type { AttachmentByteLength, Timestamp } from '../values';
import { assertTimestampOrder, immutable } from './common';

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export type AttachmentLocalState =
  | 'IMPORTING'
  | 'READY'
  | 'MISSING'
  | 'CORRUPT'
  | 'GC_PENDING';

export interface Attachment {
  readonly id: AttachmentId;
  readonly blobId: BlobId;
  readonly vaultId: VaultId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: AttachmentByteLength;
  readonly localState: AttachmentLocalState;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

interface AttachmentReferenceBase {
  readonly vaultId: VaultId;
  readonly attachmentId: AttachmentId;
}

export interface CurrentNoteAttachmentReference
  extends AttachmentReferenceBase {
  readonly source: 'NOTE';
  readonly noteId: NoteId;
}

export interface NoteVersionAttachmentReference
  extends AttachmentReferenceBase {
  readonly source: 'NOTE_VERSION';
  readonly noteVersionId: NoteVersionId;
}

export interface TrashAttachmentReference extends AttachmentReferenceBase {
  readonly source: 'TRASH';
  readonly trashEntryId: TrashEntryId;
}

export type AttachmentReference =
  | CurrentNoteAttachmentReference
  | NoteVersionAttachmentReference
  | TrashAttachmentReference;

const LOCAL_STATES: readonly AttachmentLocalState[] = [
  'IMPORTING',
  'READY',
  'MISSING',
  'CORRUPT',
  'GC_PENDING',
];

export function createAttachment(input: Attachment): Attachment {
  assertTimestampOrder(input.createdAt, input.updatedAt);
  assertDomain(
    input.byteLength <= MAX_ATTACHMENT_BYTES,
    'ATTACHMENT_TOO_LARGE',
  );
  assertDomain(input.fileName.trim().length > 0, 'INVALID_NAME');
  assertDomain(input.mimeType.trim().length > 0, 'INVALID_NAME');
  assertDomain(LOCAL_STATES.includes(input.localState), 'INVALID_ENTITY_STATE');
  return immutable({
    ...input,
    fileName: input.fileName.trim(),
    mimeType: input.mimeType.trim(),
  });
}

export function createCurrentNoteAttachmentReference(
  input: Omit<CurrentNoteAttachmentReference, 'source'>,
): CurrentNoteAttachmentReference {
  return immutable({ ...input, source: 'NOTE' as const });
}

export function createNoteVersionAttachmentReference(
  input: Omit<NoteVersionAttachmentReference, 'source'>,
): NoteVersionAttachmentReference {
  return immutable({ ...input, source: 'NOTE_VERSION' as const });
}

export function createTrashAttachmentReference(
  input: Omit<TrashAttachmentReference, 'source'>,
): TrashAttachmentReference {
  return immutable({ ...input, source: 'TRASH' as const });
}
