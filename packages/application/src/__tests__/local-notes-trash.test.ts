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
