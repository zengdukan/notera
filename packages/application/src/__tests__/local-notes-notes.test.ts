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
      document: { type: 'doc', version: 1 },
      contentVersion: 1,
      tags: [],
    });
    expect(created).not.toHaveProperty('sortOrder');
    await expect(localNotes.getNote(created.id)).resolves.toEqual(created);

    const saved = await localNotes.saveDraft({
      noteId: created.id,
      expectedContentVersion: 1,
      title: 'Saved',
      document,
    });
    expect(saved).toMatchObject({
      noteId: created.id,
      contentVersion: 2,
      savedAt: expect.any(Number),
    });
    await expect(
      localNotes.saveDraft({
        noteId: created.id,
        expectedContentVersion: 1,
        title: 'Stale',
        document,
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_VERSION_CONFLICT' });

    const moved = await localNotes.moveNote({
      noteId: created.id,
      targetFolderId: target.id,
    });
    expect(moved).toMatchObject({
      id: created.id,
      title: 'Saved',
      folderId: target.id,
      contentVersion: 2,
    });
    const copied = await localNotes.copyNote({
      noteId: created.id,
      targetFolderId: profile.rootFolderId,
    });
    expect(copied).toMatchObject({
      title: 'Saved',
      folderId: profile.rootFolderId,
      contentVersion: 1,
    });
    expect(copied.id).not.toBe(created.id);
    await expect(localNotes.getNote(copied.id)).resolves.toMatchObject({
      document,
      tags: [],
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
