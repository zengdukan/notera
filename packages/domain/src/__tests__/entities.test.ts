import {
  DomainError,
  MAX_ATTACHMENT_BYTES,
  type NoteVersion,
  asAdfDocument,
  asAttachmentByteLength,
  asAttachmentId,
  asBlobId,
  asContentVersion,
  asFolderId,
  asFolderName,
  asNoteId,
  asNoteVersionId,
  asSortOrder,
  asTagId,
  asTagName,
  asTimestamp,
  asTrashEntryId,
  asVaultId,
  createAttachment,
  createCurrentNoteAttachmentReference,
  createFavorite,
  createNote,
  createNoteTag,
  createNoteVersion,
  createRegularFolder,
  createRootFolder,
  createTag,
  createTrashEntry,
  createVaultIdentity,
  rehydrateNote,
} from '..';

const ids = {
  vault: asVaultId('10000000-0000-4000-8000-000000000001'),
  root: asFolderId('10000000-0000-4000-8000-000000000002'),
  folder: asFolderId('10000000-0000-4000-8000-000000000003'),
  note: asNoteId('10000000-0000-4000-8000-000000000004'),
  tag: asTagId('10000000-0000-4000-8000-000000000005'),
  version: asNoteVersionId('10000000-0000-4000-8000-000000000006'),
  attachment: asAttachmentId('10000000-0000-4000-8000-000000000007'),
  blob: asBlobId('10000000-0000-4000-8000-000000000008'),
  trash: asTrashEntryId('10000000-0000-4000-8000-000000000009'),
};
const now = asTimestamp(1_000);
const document = asAdfDocument({ type: 'doc', version: 1, content: [] });

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error');
}

describe('offline entities', () => {
  it('creates a vault identity and immutable hidden root folder', () => {
    const vault = createVaultIdentity({
      id: ids.vault,
      rootFolderId: ids.root,
    });
    const root = createRootFolder({
      id: ids.root,
      vaultId: ids.vault,
      createdAt: now,
    });

    expect(vault.rootFolderId).toBe(root.id);
    expect(root).toMatchObject({ kind: 'ROOT', parentId: null });
    expect('name' in root).toBe(false);
    expect(Object.isFrozen(root)).toBe(true);
  });

  it('creates a regular folder with a normalized name and parent', () => {
    const folder = createRegularFolder({
      id: ids.folder,
      vaultId: ids.vault,
      parentId: ids.root,
      name: asFolderName('Projects'),
      sortOrder: asSortOrder(2),
      createdAt: now,
      updatedAt: now,
    });

    expect(folder).toMatchObject({
      kind: 'REGULAR',
      parentId: ids.root,
      name: 'Projects',
    });
  });

  it('creates a new note at content version one and rehydrates later versions', () => {
    const note = createNote({
      id: ids.note,
      vaultId: ids.vault,
      folderId: ids.folder,
      title: '',
      document,
      sortOrder: asSortOrder(0),
      createdAt: now,
      updatedAt: now,
    });
    const restored = rehydrateNote({
      ...note,
      contentVersion: asContentVersion(7),
    });

    expect(note.contentVersion).toBe(1);
    expect(note.title).toBe('');
    expect(restored.contentVersion).toBe(7);
    expect(Object.isFrozen(restored)).toBe(true);
  });

  it('creates tags, note-tag relationships, and favorites', () => {
    const tag = createTag({
      id: ids.tag,
      vaultId: ids.vault,
      name: asTagName('work'),
      createdAt: now,
      updatedAt: now,
    });
    const noteTag = createNoteTag({
      vaultId: ids.vault,
      noteId: ids.note,
      tagId: ids.tag,
    });
    const favorite = createFavorite({
      vaultId: ids.vault,
      noteId: ids.note,
      sortOrder: asSortOrder(1),
      createdAt: now,
    });

    expect(tag.name).toBe('work');
    expect(noteTag).toMatchObject({ noteId: ids.note, tagId: ids.tag });
    expect(favorite.noteId).toBe(ids.note);
  });

  it('requires a reason only for system-protection versions', () => {
    const userVersion = createNoteVersion({
      id: ids.version,
      vaultId: ids.vault,
      noteId: ids.note,
      sourceContentVersion: asContentVersion(1),
      title: 'title',
      document,
      kind: 'USER',
      protectionReason: null,
      createdAt: now,
    });

    expect(userVersion.protectionReason).toBeNull();
    expect(() =>
      createNoteVersion({
        ...userVersion,
        kind: 'SYSTEM_PROTECTION',
        protectionReason: null,
      } as unknown as NoteVersion),
    ).toThrow(DomainError);
  });

  it('creates note and folder trash entries with original parents', () => {
    const noteEntry = createTrashEntry({
      id: ids.trash,
      vaultId: ids.vault,
      objectType: 'NOTE',
      objectId: ids.note,
      originalParentId: ids.folder,
      deletedAt: now,
      expiresAt: asTimestamp(2_000),
    });

    expect(noteEntry).toMatchObject({
      objectType: 'NOTE',
      objectId: ids.note,
      originalParentId: ids.folder,
    });
  });

  it('accepts an attachment at exactly 100 MB and its current-note reference', () => {
    const attachment = createAttachment({
      id: ids.attachment,
      blobId: ids.blob,
      vaultId: ids.vault,
      fileName: 'photo.png',
      mimeType: 'image/png',
      byteLength: asAttachmentByteLength(MAX_ATTACHMENT_BYTES),
      localState: 'READY',
      createdAt: now,
      updatedAt: now,
    });
    const reference = createCurrentNoteAttachmentReference({
      vaultId: ids.vault,
      attachmentId: ids.attachment,
      noteId: ids.note,
    });

    expect(attachment.byteLength).toBe(MAX_ATTACHMENT_BYTES);
    expect(reference).toMatchObject({ source: 'NOTE', noteId: ids.note });
    expect(Object.isFrozen(attachment)).toBe(true);
  });

  it('rejects an attachment larger than 100 MB without exposing its name', () => {
    const secretName = 'secret-financial-report.pdf';
    const error = captureError(() =>
      createAttachment({
        id: ids.attachment,
        blobId: ids.blob,
        vaultId: ids.vault,
        fileName: secretName,
        mimeType: 'application/pdf',
        byteLength: asAttachmentByteLength(MAX_ATTACHMENT_BYTES + 1),
        localState: 'READY',
        createdAt: now,
        updatedAt: now,
      }),
    );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ATTACHMENT_TOO_LARGE');
    expect((error as Error).message).not.toContain(secretName);
  });

  it('rejects entity timestamps that move backwards', () => {
    expect(() =>
      createRegularFolder({
        id: ids.folder,
        vaultId: ids.vault,
        parentId: ids.root,
        name: asFolderName('Projects'),
        sortOrder: asSortOrder(0),
        createdAt: asTimestamp(2_000),
        updatedAt: asTimestamp(1_000),
      }),
    ).toThrow(DomainError);
  });
});
