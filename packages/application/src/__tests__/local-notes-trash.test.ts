import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('LocalNotesService grouped trash', () => {
  it('lists, restores, and permanently deletes complete folder groups', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Trash',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const parent = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'Parent',
    });
    const child = await localNotes.createFolder({
      parentFolderId: parent.id,
      name: 'Child',
    });
    const note = await localNotes.createNote({
      folderId: child.id,
      title: 'Nested',
    });

    const trashed = await localNotes.trashFolder(parent.id);
    const page = await localNotes.listTrash({ limit: 10 });
    expect(page.items).toEqual([
      expect.objectContaining({
        trashEntryId: trashed.trashEntryId,
        objectId: parent.id,
        kind: 'folder',
        displayName: 'Parent',
        originalParentAvailable: true,
      }),
    ]);
    expect((await localNotes.listChildren({
      parentFolderId: profile.rootFolderId,
      limit: 10,
    })).items).toEqual([]);
    await expect(localNotes.getNote(note.id)).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });

    await localNotes.restoreTrash({ trashEntryId: trashed.trashEntryId });
    expect((await localNotes.listTrash({ limit: 10 })).items).toEqual([]);
    expect((await localNotes.getNote(note.id)).folderId).toBe(child.id);

    const trashedAgain = await localNotes.trashFolder(parent.id);
    await expect(
      localNotes.deleteTrashPermanent(trashedAgain.trashEntryId),
    ).resolves.toEqual({ deletedCount: 3 });
    await expect(localNotes.getNote(note.id)).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });
    await expect(localNotes.purgeExpiredTrash()).resolves.toEqual({
      deletedCount: 0,
    });

    await manager.close();
  }, 60_000);
});
