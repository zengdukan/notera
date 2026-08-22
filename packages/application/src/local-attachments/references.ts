import {
  createCurrentNoteAttachmentReference,
  createNoteVersionAttachmentReference,
  type AttachmentReference,
  type CurrentNoteAttachmentReference,
  type NoteId,
  type NoteVersionAttachmentReference,
  type NoteVersionId,
} from '@notera/domain';
import type { AttachmentReader } from '@notera/storage-sqlcipher';

export interface ReferenceReplacement {
  readonly remove: readonly AttachmentReference[];
  readonly add: readonly AttachmentReference[];
}

function immutable<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

export class AttachmentReferenceCoordinator {
  constructor(private readonly attachments: AttachmentReader) {}

  copyNotes(
    sourceNoteIds: readonly NoteId[],
    targetNoteIdMap: ReadonlyMap<NoteId, NoteId>,
  ): readonly CurrentNoteAttachmentReference[] {
    const source = this.attachments.listReferencesForNotes(sourceNoteIds);
    return immutable(
      source.flatMap((reference) => {
        const noteId = targetNoteIdMap.get(reference.noteId);
        return noteId === undefined
          ? []
          : [
              createCurrentNoteAttachmentReference({
                vaultId: reference.vaultId,
                attachmentId: reference.attachmentId,
                noteId,
              }),
            ];
      }),
    );
  }

  snapshotNote(
    noteId: NoteId,
    versionId: NoteVersionId,
  ): readonly NoteVersionAttachmentReference[] {
    return immutable(
      this.attachments.listReferencesForNotes([noteId]).map((reference) =>
        createNoteVersionAttachmentReference({
          vaultId: reference.vaultId,
          attachmentId: reference.attachmentId,
          noteVersionId: versionId,
        }),
      ),
    );
  }

  restoreVersion(
    noteId: NoteId,
    versionId: NoteVersionId,
    protectionVersionId: NoteVersionId,
  ): ReferenceReplacement {
    const current = this.attachments.listReferencesForNotes([noteId]);
    const historical = this.attachments.listReferencesForVersions([versionId]);
    return Object.freeze({
      remove: immutable(current),
      add: immutable([
        ...current.map((reference) =>
          createNoteVersionAttachmentReference({
            vaultId: reference.vaultId,
            attachmentId: reference.attachmentId,
            noteVersionId: protectionVersionId,
          }),
        ),
        ...historical.map((reference) =>
          createCurrentNoteAttachmentReference({
            vaultId: reference.vaultId,
            attachmentId: reference.attachmentId,
            noteId,
          }),
        ),
      ]),
    });
  }

  copyVersion(
    versionId: NoteVersionId,
    targetNoteId: NoteId,
  ): readonly CurrentNoteAttachmentReference[] {
    return immutable(
      this.attachments
        .listReferencesForVersions([versionId])
        .map((reference) =>
          createCurrentNoteAttachmentReference({
            vaultId: reference.vaultId,
            attachmentId: reference.attachmentId,
            noteId: targetNoteId,
          }),
        ),
    );
  }
}
