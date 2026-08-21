import { assertDomain, failDomain } from '../errors';
import type { NoteId, VaultId } from '../ids';
import {
  createAttachment,
  createCurrentNoteAttachmentReference,
  type Attachment,
  type AttachmentReference,
  type CurrentNoteAttachmentReference,
} from '../models/attachment';
import type { Timestamp } from '../values';

function immutableArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function referenceOwner(reference: AttachmentReference): string {
  switch (reference.source) {
    case 'NOTE':
      return reference.noteId;
    case 'NOTE_VERSION':
      return reference.noteVersionId;
    case 'TRASH':
      return reference.trashEntryId;
    default: {
      const exhaustive: never = reference;
      return exhaustive;
    }
  }
}

function sameReference(
  left: AttachmentReference,
  right: AttachmentReference,
): boolean {
  return (
    left.vaultId === right.vaultId &&
    left.attachmentId === right.attachmentId &&
    left.source === right.source &&
    referenceOwner(left) === referenceOwner(right)
  );
}

export function referencesForAttachment(
  attachment: Attachment,
  references: readonly AttachmentReference[],
): readonly AttachmentReference[] {
  const matching = references.filter(
    (reference) => reference.attachmentId === attachment.id,
  );
  assertDomain(
    matching.every((reference) => reference.vaultId === attachment.vaultId),
    'VAULT_MISMATCH',
  );
  return immutableArray(matching);
}

export function countAttachmentReferences(
  attachment: Attachment,
  references: readonly AttachmentReference[],
): number {
  return referencesForAttachment(attachment, references).length;
}

export function addAttachmentReference(
  attachment: Attachment,
  reference: AttachmentReference,
  references: readonly AttachmentReference[],
): readonly AttachmentReference[] {
  assertDomain(reference.vaultId === attachment.vaultId, 'VAULT_MISMATCH');
  assertDomain(
    reference.attachmentId === attachment.id,
    'INVALID_ENTITY_STATE',
  );
  if (references.some((item) => sameReference(item, reference))) {
    return immutableArray(references);
  }
  return immutableArray([...references, reference]);
}

export function removeAttachmentReference(
  reference: AttachmentReference,
  references: readonly AttachmentReference[],
): readonly AttachmentReference[] {
  return immutableArray(
    references.filter((item) => !sameReference(item, reference)),
  );
}

export interface CopyCurrentNoteAttachmentReferencesInput {
  readonly vaultId: VaultId;
  readonly sourceNoteId: NoteId;
  readonly targetNoteId: NoteId;
  readonly references: readonly AttachmentReference[];
}

export function copyCurrentNoteAttachmentReferences(
  input: CopyCurrentNoteAttachmentReferencesInput,
): readonly CurrentNoteAttachmentReference[] {
  if (input.sourceNoteId === input.targetNoteId) {
    failDomain('DUPLICATE_TARGET_ID');
  }
  const sourceReferences = input.references.filter(
    (reference): reference is CurrentNoteAttachmentReference =>
      reference.source === 'NOTE' && reference.noteId === input.sourceNoteId,
  );
  assertDomain(
    sourceReferences.every((reference) => reference.vaultId === input.vaultId),
    'VAULT_MISMATCH',
  );
  return immutableArray(
    sourceReferences.map((reference) =>
      createCurrentNoteAttachmentReference({
        vaultId: input.vaultId,
        attachmentId: reference.attachmentId,
        noteId: input.targetNoteId,
      }),
    ),
  );
}

export function markAttachmentGcPending(
  attachment: Attachment,
  references: readonly AttachmentReference[],
  updatedAt: Timestamp,
): Attachment {
  if (countAttachmentReferences(attachment, references) > 0) {
    failDomain('ATTACHMENT_STILL_REFERENCED');
  }
  return createAttachment({
    ...attachment,
    localState: 'GC_PENDING',
    updatedAt,
  });
}
