/* eslint-disable no-restricted-syntax */
import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('attachment reference lifecycle', () => {
  it('removes independent attachments while retaining a shared SHA blob', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'References',
      password: 'correct horse battery staple',
    });
    const note = await manager.localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Shared blob',
    });
    const bytes = new Uint8Array([4, 5, 6]);
    const importOne = () =>
      manager.localAttachments.importAttachment({
        noteId: note.id,
        fileName: 'shared.bin',
        mimeType: 'application/octet-stream',
        source: (async function* attachmentSource() {
          yield bytes;
        })(),
      });
    const first = await importOne();
    const second = await importOne();

    await manager.localAttachments.removeFromNote({
      noteId: note.id,
      attachmentId: first.id,
    });
    await expect(
      manager.localAttachments.openReader(first.id),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    const reader = await manager.localAttachments.openReader(second.id);
    await expect(
      (async () => {
        const chunks: number[] = [];
        for await (const chunk of reader.stream()) chunks.push(...chunk);
        return chunks;
      })(),
    ).resolves.toEqual([...bytes]);
    await reader.close();

    await manager.localAttachments.removeFromNote({
      noteId: note.id,
      attachmentId: second.id,
    });
    await expect(manager.localAttachments.collectGarbage()).resolves.toEqual({
      scannedCount: 0,
      collectedCount: 0,
      retryCount: 0,
    });
    await manager.close();
  });

  it('replaces current note attachment references from saved ADF atomically', async () => {
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
      title: note.title,
      document: {
        type: 'doc',
        version: 1,
        content: [{ type: 'media', attrs: { id: attachment.id } }],
      },
    });

    await expect(
      manager.localAttachments.listForNote({ noteId: note.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: attachment.id })],
    });

    await expect(manager.localNotes.saveDraft({
      noteId: note.id,
      title: 'Invalid attachment must roll back',
      document: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'media',
          attrs: { id: '10000000-0000-4000-8000-000000000099' },
        }],
      },
    })).rejects.toBeDefined();
    await expect(manager.localNotes.getNote(note.id)).resolves.toMatchObject({
      title: note.title,
      contentVersion: 2,
    });
    await manager.close();
  });
});
