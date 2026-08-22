/* eslint-disable no-restricted-syntax, no-await-in-loop */
import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

async function findBlobFile(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      try {
        return await findBlobFile(path);
      } catch {
        // Continue searching sibling directories.
      }
    } else if (entry.isFile() && entry.name.endsWith('.blob')) {
      return path;
    }
  }
  throw new Error('blob not found');
}

describe('ProfileManager production integration', () => {
  it('reconciles missing and orphan attachment blobs before publishing unlock', async () => {
    const appDataRoot = tempRoot();
    const manager = await createProfileManager({ appDataRoot });
    const created = await manager.createProfile({
      displayName: 'Recovery',
      password: 'correct horse battery staple',
    });
    const service = manager.localAttachments;
    const note = await manager.localNotes.createNote({
      folderId: created.rootFolderId,
      title: 'Recovery',
    });
    const attachment = await service.importAttachment({
      noteId: note.id,
      fileName: 'recover.bin',
      mimeType: 'application/octet-stream',
      source: (async function* attachmentSource() {
        yield new Uint8Array([1, 2, 3]);
      })(),
    });
    const profileRoot = join(appDataRoot, 'profiles', created.localProfileId);
    const knownPath = await findBlobFile(profileRoot);
    const orphanId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const orphanPath = join(profileRoot, 'blobs', 'aa', `${orphanId}.blob`);

    await manager.lockProfile();
    await mkdir(dirname(orphanPath), { recursive: true });
    await copyFile(knownPath, orphanPath);
    await unlink(knownPath);
    await manager.unlockProfile({
      localProfileId: created.localProfileId,
      password: 'correct horse battery staple',
    });

    expect(manager.localAttachments).toBe(service);
    await expect(
      service.listForNote({ noteId: note.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: attachment.id,
          localState: 'MISSING',
        }),
      ],
    });
    await expect(stat(orphanPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await manager.close();
  }, 30_000);

  it('creates, locks, rejects a wrong password, unlocks, and renames a profile', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const created = await manager.createProfile({
      displayName: ' Personal ',
      password: 'correct horse battery staple',
    });
    expect(created).toMatchObject({
      state: 'UNLOCKED',
      displayName: 'Personal',
    });
    expect(manager.listProfiles({ limit: 10 }).items).toEqual([
      expect.objectContaining({
        localProfileId: created.localProfileId,
        displayName: 'Personal',
        isCurrent: true,
      }),
    ]);

    await manager.lockProfile();
    expect(manager.getSessionState()).toEqual({ state: 'LOCKED' });
    await expect(
      manager.unlockProfile({
        localProfileId: created.localProfileId,
        password: 'wrong password',
      }),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });

    const unlocked = await manager.unlockProfile({
      localProfileId: created.localProfileId,
      password: 'correct horse battery staple',
    });
    expect(unlocked.rootFolderId).toEqual(created.rootFolderId);
    const renamed = await manager.renameProfile('Renamed');
    expect(renamed.displayName).toBe('Renamed');
    expect(manager.getSessionState()).toMatchObject({ displayName: 'Renamed' });

    await manager.close();
    await expect(manager.lockProfile()).rejects.toMatchObject({
      code: 'APPLICATION_CLOSED',
    });
  }, 30_000);
});
