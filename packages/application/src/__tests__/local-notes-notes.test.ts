import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

const document = {
  type: 'doc' as const,
  version: 1 as const,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '正文' }],
    },
  ],
};

afterEach(() => cleanupTempRoots());

describe('LocalNotesService note use cases', () => {
  it('creates, saves, moves, copies, trashes, and lists notes atomically', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Notes',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const target = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'Target',
    });

    const created = await localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Draft',
    });
    expect(created).toMatchObject({
      kind: 'note',
      title: 'Draft',
      folderId: profile.rootFolderId,
      document: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [] }],
      },
      contentVersion: 1,
      isFavorite: false,
      tags: [],
    });
    expect(created).not.toHaveProperty('sortOrder');
    await expect(localNotes.getNote(created.id)).resolves.toEqual(created);
    await expect(
      localNotes.listChildren({
        parentFolderId: profile.rootFolderId,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: created.id, isFavorite: false }),
      ]),
    });

    const renamed = await localNotes.renameNote({
      noteId: created.id,
      title: 'Renamed without document DTO',
    });
    expect(renamed).toMatchObject({
      id: created.id,
      title: 'Renamed without document DTO',
      contentVersion: 2,
    });
    expect(renamed).not.toHaveProperty('document');

    const saved = await localNotes.saveDraft({
      noteId: created.id,
      title: 'Saved',
      document,
    });
    expect(saved).toMatchObject({
      noteId: created.id,
      contentVersion: 3,
      savedAt: expect.any(Number),
    });
    await expect(
      localNotes.saveDraft({
        noteId: created.id,
        title: 'Saved again',
        document,
      }),
    ).resolves.toMatchObject({ contentVersion: 4 });

    await localNotes.addFavorite(created.id);
    await expect(localNotes.getNote(created.id)).resolves.toMatchObject({
      isFavorite: true,
    });
    await expect(
      localNotes.listChildren({
        parentFolderId: profile.rootFolderId,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: created.id, isFavorite: true }),
      ]),
    });
    await localNotes.removeFavorite(created.id);
    await expect(localNotes.getNote(created.id)).resolves.toMatchObject({
      isFavorite: false,
    });
    await expect(
      localNotes.listChildren({
        parentFolderId: profile.rootFolderId,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: created.id, isFavorite: false }),
      ]),
    });

    const moved = await localNotes.moveNote({
      noteId: created.id,
      targetFolderId: target.id,
    });
    expect(moved).toMatchObject({
      id: created.id,
      title: 'Saved again',
      folderId: target.id,
      contentVersion: 4,
    });
    const attachment = await manager.localAttachments.importAttachment({
      noteId: created.id,
      fileName: 'copy.txt',
      mimeType: 'text/plain',
      source: (async function* attachmentSource() {
        yield new Uint8Array([1, 2, 3]);
      })(),
    });
    const copied = await localNotes.copyNote({
      noteId: created.id,
      targetFolderId: profile.rootFolderId,
    });
    expect(copied).toMatchObject({
      title: 'Saved again',
      folderId: profile.rootFolderId,
      contentVersion: 1,
    });
    expect(copied.id).not.toBe(created.id);
    await expect(localNotes.getNote(copied.id)).resolves.toMatchObject({
      document,
      tags: [],
    });
    await expect(
      manager.localAttachments.listForNote({ noteId: copied.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: attachment.id })],
    });

    const recent = await localNotes.listRecent({ limit: 20 });
    expect(new Set(recent.items.map(({ id }) => id))).toEqual(
      new Set([created.id, copied.id]),
    );
    expect(recent.items.every((item) => !('sortOrder' in item))).toBe(true);

    await expect(localNotes.trashNote(created.id)).resolves.toEqual({
      trashEntryId: expect.any(String),
    });
    expect(
      (await localNotes.listRecent({ limit: 20 })).items.map(({ id }) => id),
    ).toEqual([copied.id]);

    await expect(
      localNotes.createNote({
        folderId: '40000000-0000-4000-8000-000000000999' as typeof target.id,
        title: 'Missing parent',
      }),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    await manager.close();
  }, 60_000);
});
