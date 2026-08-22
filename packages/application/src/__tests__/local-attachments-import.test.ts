import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

async function* source(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes.slice(0, 2);
  yield bytes.slice(2);
}

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

describe('LocalAttachmentsService import', () => {
  it('keeps a stable facade and creates two attachments backed by one SHA blob', async () => {
    const appDataRoot = tempRoot();
    const manager = await createProfileManager({ appDataRoot });
    const service = manager.localAttachments;
    const unlocked = await manager.createProfile({
      displayName: 'Attachments',
      password: 'correct horse battery staple',
    });
    const note = await manager.localNotes.createNote({
      folderId: unlocked.rootFolderId,
      title: 'With files',
    });
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const first = await service.importAttachment({
      noteId: note.id,
      fileName: ' same.bin ',
      mimeType: ' application/octet-stream ',
      source: source(bytes),
    });
    const second = await service.importAttachment({
      noteId: note.id,
      fileName: 'different.dat',
      mimeType: 'text/plain',
      source: source(bytes),
    });

    expect(first.id).not.toBe(second.id);
    expect(first.fileName).toBe('same.bin');
    expect(second.mime).toBe('text/plain');
    const page = await service.listForNote({ noteId: note.id, limit: 10 });
    expect(page.items.map(({ id }) => id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    const profile = manager.listProfiles({ limit: 10 }).items[0];
    expect(
      await countBlobFiles(join(appDataRoot, 'profiles', profile.localProfileId)),
    ).toBe(1);

    await manager.lockProfile();
    expect(manager.localAttachments).toBe(service);
    await expect(
      service.listForNote({ noteId: note.id, limit: 10 }),
    ).rejects.toMatchObject({ code: 'PROFILE_LOCKED' });
    await manager.close();
  });

  it('validates metadata and creates different blobs for different plaintext', async () => {
    const appDataRoot = tempRoot();
    const manager = await createProfileManager({ appDataRoot });
    const unlocked = await manager.createProfile({
      displayName: 'Attachments',
      password: 'correct horse battery staple',
    });
    const note = await manager.localNotes.createNote({
      folderId: unlocked.rootFolderId,
      title: 'With files',
    });

    await expect(
      manager.localAttachments.importAttachment({
        noteId: note.id,
        fileName: '   ',
        mimeType: 'text/plain',
        source: source(new Uint8Array()),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_NAME' });
    const first = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'one.bin',
      mimeType: 'application/octet-stream',
      source: source(new Uint8Array([1])),
    });
    const second = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'two.bin',
      mimeType: 'application/octet-stream',
      source: source(new Uint8Array([2])),
    });

    expect(first.id).not.toBe(second.id);
    const profile = manager.listProfiles({ limit: 10 }).items[0];
    expect(
      await countBlobFiles(join(appDataRoot, 'profiles', profile.localProfileId)),
    ).toBe(2);
    await manager.close();
  });
});
