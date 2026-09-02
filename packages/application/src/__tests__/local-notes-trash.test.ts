import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

async function countBlobFiles(root: string): Promise<number> {
  let count = 0;
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile() && entry.name.endsWith('.blob')) count += 1;
      }),
    );
  };
  await visit(root);
  return count;
}

describe('LocalNotesService grouped trash', () => {
  it('keeps an independently deleted note visible after deleting its parent folder', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Independent trash groups',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const today = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'today',
    });
    const top = await localNotes.createFolder({
      parentFolderId: today.id,
      name: 'top',
    });
    const math = await localNotes.createNote({
      folderId: top.id,
      title: '数学',
    });

    const trashedMath = await localNotes.trashNote(math.id);
    const trashedTop = await localNotes.trashFolder(top.id);

    expect((await localNotes.listTrash({ limit: 10 })).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trashEntryId: trashedMath.trashEntryId,
          displayName: '数学',
          folderPath: [
            { id: profile.rootFolderId, name: '' },
            { id: today.id, name: 'today' },
            { id: top.id, name: 'top' },
          ],
        }),
        expect.objectContaining({
          trashEntryId: trashedTop.trashEntryId,
          displayName: 'top',
          folderPath: [
            { id: profile.rootFolderId, name: '' },
            { id: today.id, name: 'today' },
          ],
        }),
      ]),
    );
    expect((await localNotes.listTrash({ limit: 10 })).items).toHaveLength(2);

    await manager.close();
  });

  it('restores an earlier note through a rebuilt path without restoring its parent group', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Nested trash',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const today = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'today',
    });
    const top = await localNotes.createFolder({
      parentFolderId: today.id,
      name: 'top',
    });
    const nested = await localNotes.createFolder({
      parentFolderId: top.id,
      name: 'nested',
    });
    const math = await localNotes.createNote({
      folderId: top.id,
      title: '数学',
    });
    const groupedNote = await localNotes.createNote({
      folderId: top.id,
      title: 'Grouped note',
    });

    const trashedMath = await localNotes.trashNote(math.id);
    const trashedNested = await localNotes.trashFolder(nested.id);
    const trashedTop = await localNotes.trashFolder(top.id);

    const items = (await localNotes.listTrash({ limit: 10 })).items;
    expect(items).toHaveLength(3);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trashEntryId: trashedMath.trashEntryId,
          objectId: math.id,
          kind: 'note',
          displayName: '数学',
        }),
        expect.objectContaining({
          trashEntryId: trashedNested.trashEntryId,
          objectId: nested.id,
          kind: 'folder',
          displayName: 'nested',
        }),
        expect.objectContaining({
          trashEntryId: trashedTop.trashEntryId,
          objectId: top.id,
          kind: 'folder',
          displayName: 'top',
          folderPath: [
            { id: profile.rootFolderId, name: '' },
            { id: today.id, name: 'today' },
          ],
          originalParentAvailable: true,
        }),
      ]),
    );
    await localNotes.restoreTrash({ trashEntryId: trashedMath.trashEntryId });
    const restoredMath = await localNotes.getNote(math.id);
    expect(restoredMath.folderId).not.toBe(top.id);
    expect(await localNotes.getFolderPath(restoredMath.folderId)).toEqual({
      items: [
        { id: profile.rootFolderId, name: '' },
        { id: today.id, name: 'today' },
        { id: restoredMath.folderId, name: 'top' },
      ],
    });
    expect((await localNotes.listTrash({ limit: 10 })).items).toHaveLength(2);
    expect((await localNotes.listTrash({ limit: 10 })).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trashEntryId: trashedNested.trashEntryId,
          displayName: 'nested',
          folderPath: [
            { id: profile.rootFolderId, name: '' },
            { id: today.id, name: 'today' },
            { id: top.id, name: 'top' },
          ],
        }),
        expect.objectContaining({
          trashEntryId: trashedTop.trashEntryId,
          displayName: 'top',
        }),
      ]),
    );
    await localNotes.restoreTrash({ trashEntryId: trashedTop.trashEntryId });
    expect(await localNotes.getNote(groupedNote.id)).toMatchObject({
      folderId: restoredMath.folderId,
      title: 'Grouped note',
    });
    expect((await localNotes.listTrash({ limit: 10 })).items).toEqual([
      expect.objectContaining({
        trashEntryId: trashedNested.trashEntryId,
        folderPath: [
          { id: profile.rootFolderId, name: '' },
          { id: today.id, name: 'today' },
          { id: restoredMath.folderId, name: 'top' },
        ],
      }),
    ]);
    await localNotes.restoreTrash({
      trashEntryId: trashedNested.trashEntryId,
    });
    expect(await localNotes.getFolderPath(nested.id)).toEqual({
      items: [
        { id: profile.rootFolderId, name: '' },
        { id: today.id, name: 'today' },
        { id: restoredMath.folderId, name: 'top' },
        { id: nested.id, name: 'nested' },
      ],
    });
    expect((await localNotes.listTrash({ limit: 10 })).items).toEqual([]);

    await manager.close();
  });

  it('rebases an independent note when its trashed parent is deleted permanently', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Permanent parent delete',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const today = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'today',
    });
    const top = await localNotes.createFolder({
      parentFolderId: today.id,
      name: 'top',
    });
    const math = await localNotes.createNote({
      folderId: top.id,
      title: '数学',
    });
    const trashedMath = await localNotes.trashNote(math.id);
    const trashedTop = await localNotes.trashFolder(top.id);

    await localNotes.deleteTrashPermanent(trashedTop.trashEntryId);

    expect((await localNotes.listTrash({ limit: 10 })).items).toEqual([
      expect.objectContaining({
        trashEntryId: trashedMath.trashEntryId,
        folderPath: [
          { id: profile.rootFolderId, name: '' },
          { id: today.id, name: 'today' },
        ],
      }),
    ]);
    await localNotes.restoreTrash({ trashEntryId: trashedMath.trashEntryId });
    expect(await localNotes.getNote(math.id)).toMatchObject({
      folderId: today.id,
    });

    await manager.close();
  });

  it('lists, restores, and permanently deletes complete folder groups', async () => {
    const appDataRoot = tempRoot();
    const manager = await createProfileManager({ appDataRoot });
    const profile = await manager.createProfile({
      displayName: 'Trash',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const archive = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'Archive',
    });
    const parent = await localNotes.createFolder({
      parentFolderId: archive.id,
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
    const attachment = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'trash.bin',
      mimeType: 'application/octet-stream',
      source: (async function* attachmentSource() {
        yield new Uint8Array([1, 2, 3]);
      })(),
    });
    await localNotes.addFavorite(note.id);

    const trashed = await localNotes.trashFolder(parent.id);
    const page = await localNotes.listTrash({ limit: 10 });
    expect(page.items).toEqual([
      expect.objectContaining({
        trashEntryId: trashed.trashEntryId,
        objectId: parent.id,
        kind: 'folder',
        displayName: 'Parent',
        folderPath: [
          { id: profile.rootFolderId, name: '' },
          { id: archive.id, name: 'Archive' },
        ],
        originalParentAvailable: true,
      }),
    ]);
    expect(
      (
        await localNotes.listChildren({
          parentFolderId: profile.rootFolderId,
          limit: 10,
        })
      ).items,
    ).toEqual([expect.objectContaining({ id: archive.id, name: 'Archive' })]);
    await expect(localNotes.getNote(note.id)).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });
    const trashedReader = await manager.localAttachments.openReader(
      attachment.id,
    );
    await trashedReader.close();

    await localNotes.restoreTrash({ trashEntryId: trashed.trashEntryId });
    expect((await localNotes.listTrash({ limit: 10 })).items).toEqual([]);
    expect(await localNotes.getNote(note.id)).toMatchObject({
      folderId: child.id,
      isFavorite: false,
    });
    expect((await localNotes.listFavorites({ limit: 10 })).items).toEqual([]);
    await expect(
      manager.localAttachments.listForNote({ noteId: note.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: attachment.id })],
    });

    const trashedAgain = await localNotes.trashFolder(parent.id);
    await expect(
      localNotes.deleteTrashPermanent(trashedAgain.trashEntryId),
    ).resolves.toEqual({ deletedCount: 3 });
    await expect(localNotes.getNote(note.id)).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });
    await expect(
      manager.localAttachments.openReader(attachment.id),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    expect(await countBlobFiles(join(appDataRoot, 'profiles'))).toBe(0);
    await expect(localNotes.purgeExpiredTrash()).resolves.toEqual({
      deletedCount: 0,
    });

    await manager.close();
  }, 60_000);
});
