import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('attachment reference lifecycle', () => {
  it('keeps explicit attachment references independent from draft ADF', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'References',
      password: 'correct horse battery staple',
    });
    const note = await manager.localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Explicit references',
    });
    const attachment = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'explicit.bin',
      mimeType: 'application/octet-stream',
      source: (async function* attachmentSource() {
        yield new Uint8Array([1, 2, 3]);
      })(),
    });

    await manager.localNotes.saveDraft({
      noteId: note.id,
      expectedContentVersion: note.contentVersion,
      title: note.title,
      document: {
        type: 'doc',
        version: 1,
        content: [{ type: 'media', attrs: { id: 'untrusted-adf-id' } }],
      },
    });

    await expect(
      manager.localAttachments.listForNote({ noteId: note.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: attachment.id })],
    });
    await manager.close();
  });
});
