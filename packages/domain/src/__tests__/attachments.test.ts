import {
  MAX_ATTACHMENT_BYTES,
  addAttachmentReference,
  asAttachmentByteLength,
  asAttachmentId,
  asBlobId,
  asNoteId,
  asNoteVersionId,
  asTimestamp,
  asTrashEntryId,
  asVaultId,
  copyCurrentNoteAttachmentReferences,
  countAttachmentReferences,
  createAttachment,
  createAttachmentBlob,
  createCurrentNoteAttachmentReference,
  createNoteVersionAttachmentReference,
  createTrashAttachmentReference,
  markAttachmentBlobGcPending,
  referencesForAttachment,
  removeAttachmentReference,
} from '..';

const uuid = (suffix: string) =>
  `40000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const vaultId = asVaultId(uuid('1'));
const attachmentId = asAttachmentId(uuid('2'));
const now = asTimestamp(1_000);
const blob = createAttachmentBlob({
  id: asBlobId(uuid('3')),
  vaultId,
  contentSha256: new Uint8Array(32).fill(7),
  byteLength: asAttachmentByteLength(MAX_ATTACHMENT_BYTES),
  localState: 'READY',
  createdAt: now,
  updatedAt: now,
});
const attachment = createAttachment({
  id: attachmentId,
  blobId: blob.id,
  vaultId,
  fileName: 'file.bin',
  mimeType: 'application/octet-stream',
  createdAt: now,
});
const noteReference = createCurrentNoteAttachmentReference({
  vaultId,
  attachmentId,
  noteId: asNoteId(uuid('4')),
});
const versionReference = createNoteVersionAttachmentReference({
  vaultId,
  attachmentId,
  noteVersionId: asNoteVersionId(uuid('5')),
});
const trashReference = createTrashAttachmentReference({
  vaultId,
  attachmentId,
  trashEntryId: asTrashEntryId(uuid('6')),
});

describe('attachment reference rules', () => {
  it('separates immutable blob content from visible attachment metadata', () => {
    const digest = new Uint8Array(32).fill(9);
    const created = createAttachmentBlob({
      ...blob,
      contentSha256: digest,
    });

    digest.fill(0);

    expect(created.contentSha256).toEqual(new Uint8Array(32).fill(9));
    expect(created).not.toHaveProperty('fileName');
    expect(attachment).not.toHaveProperty('byteLength');
    expect(attachment).not.toHaveProperty('localState');
    expect(Object.isFrozen(created)).toBe(true);
  });

  it('rejects malformed content digests but permits legacy null digests', () => {
    expect(
      createAttachmentBlob({ ...blob, contentSha256: undefined }),
    ).not.toHaveProperty('contentSha256');
    expect(() =>
      createAttachmentBlob({ ...blob, contentSha256: new Uint8Array(31) }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ENTITY_STATE' }));
  });

  it('counts current-note, permanent-version, and trash references', () => {
    const references = [noteReference, versionReference, trashReference];

    expect(referencesForAttachment(attachment, references)).toEqual(references);
    expect(countAttachmentReferences(attachment, references)).toBe(3);
  });

  it('does not mix references from another attachment', () => {
    const otherReference = createCurrentNoteAttachmentReference({
      vaultId,
      attachmentId: asAttachmentId(uuid('7')),
      noteId: asNoteId(uuid('8')),
    });

    expect(
      referencesForAttachment(attachment, [noteReference, otherReference]),
    ).toEqual([noteReference]);
  });

  it('adds and removes references idempotently', () => {
    const added = addAttachmentReference(attachment, noteReference, []);
    const duplicate = addAttachmentReference(attachment, noteReference, added);

    expect(duplicate).toHaveLength(1);
    expect(removeAttachmentReference(noteReference, duplicate)).toEqual([]);
    expect(removeAttachmentReference(noteReference, [])).toEqual([]);
  });

  it('rejects a reference from another vault', () => {
    const invalidReference = createCurrentNoteAttachmentReference({
      vaultId: asVaultId(uuid('9')),
      attachmentId,
      noteId: asNoteId(uuid('10')),
    });

    expect(() =>
      addAttachmentReference(attachment, invalidReference, []),
    ).toThrow(expect.objectContaining({ code: 'VAULT_MISMATCH' }));
  });

  it('copies only current-note references while reusing attachments', () => {
    const targetNoteId = asNoteId(uuid('11'));
    const copied = copyCurrentNoteAttachmentReferences({
      vaultId,
      sourceNoteId: noteReference.noteId,
      targetNoteId,
      references: [noteReference, versionReference, trashReference],
    });

    expect(copied).toEqual([
      expect.objectContaining({
        source: 'NOTE',
        noteId: targetNoteId,
        attachmentId,
      }),
    ]);
  });

  it('allows GC only when no current, history, or trash reference remains', () => {
    expect(() =>
      markAttachmentBlobGcPending(blob, [attachment], asTimestamp(2_000)),
    ).toThrow(expect.objectContaining({ code: 'ATTACHMENT_STILL_REFERENCED' }));

    const pending = markAttachmentBlobGcPending(blob, [], asTimestamp(2_000));
    const pendingAgain = markAttachmentBlobGcPending(
      pending,
      [],
      asTimestamp(3_000),
    );

    expect(pending.localState).toBe('GC_PENDING');
    expect(pendingAgain.localState).toBe('GC_PENDING');
    expect(blob.localState).toBe('READY');
    expect(Object.isFrozen(pending)).toBe(true);
  });
});
