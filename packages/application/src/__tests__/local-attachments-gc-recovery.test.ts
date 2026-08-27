import { asAttachmentId, asTimestamp } from '@notera/domain';
import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('local attachment garbage collection', () => {
  it('retries a leased blob and finalizes it after the Reader closes', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Garbage collection',
      password: 'correct horse battery staple',
    });
    const note = await manager.localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Leased',
    });
    const attachment = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'leased.bin',
      mimeType: 'application/octet-stream',
      source: (async function* attachmentSource() {
        yield new Uint8Array([1, 2, 3]);
      })(),
    });
    const reader = await manager.localAttachments.openReader(attachment.id);

    await manager.localAttachments.removeFromNote({
      noteId: note.id,
      attachmentId: attachment.id,
    });
    await expect(manager.localAttachments.collectGarbage()).resolves.toEqual({
      scannedCount: 1,
      collectedCount: 0,
      retryCount: 1,
    });

    await reader.close();
    await expect(manager.localAttachments.collectGarbage()).resolves.toEqual({
      scannedCount: 1,
      collectedCount: 1,
      retryCount: 0,
    });
    await expect(manager.localAttachments.collectGarbage()).resolves.toEqual({
      scannedCount: 0,
      collectedCount: 0,
      retryCount: 0,
    });
    await manager.close();
  });

  it('removes expired temporary uploads before collecting their encrypted blobs', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Expired uploads',
      password: 'correct horse battery staple',
    });
    const note = await manager.localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Abandoned editor upload',
    });
    const fileId = asAttachmentId('92000000-0000-4000-8000-000000000001');
    const expiresAt = Date.now() + 60_000;
    await manager.localAttachments.importAttachment({
      attachmentId: fileId,
      noteId: note.id,
      reference: { kind: 'UPLOAD', expiresAt: asTimestamp(expiresAt) },
      fileName: 'abandoned.bin',
      mimeType: 'application/octet-stream',
      source: (async function* attachmentSource() {
        yield new Uint8Array([7, 8, 9]);
      })(),
    });

    const now = jest.spyOn(Date, 'now').mockReturnValue(expiresAt + 1);
    await expect(manager.localAttachments.collectGarbage()).resolves.toEqual({
      scannedCount: 1,
      collectedCount: 1,
      retryCount: 0,
    });
    now.mockRestore();
    await expect(
      manager.localAttachments.openReader(fileId),
    ).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });
    await manager.close();
  });
});
