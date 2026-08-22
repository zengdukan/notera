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
});
