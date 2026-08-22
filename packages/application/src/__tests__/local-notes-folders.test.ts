import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('LocalNotesService content tree', () => {
  it('keeps one facade across lock and profile changes while sorting folders', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const firstProfile = await manager.createProfile({
      displayName: 'First',
      password: 'correct horse battery staple',
    });
    const service = manager.localNotes;
    const zulu = await service.createFolder({
      parentFolderId: firstProfile.rootFolderId,
      name: 'Zulu',
    });
    const alpha = await service.createFolder({
      parentFolderId: firstProfile.rootFolderId,
      name: 'alpha',
    });
    await service.createFolder({
      parentFolderId: alpha.id,
      name: 'child',
    });

    const page = await service.listChildren({
      parentFolderId: firstProfile.rootFolderId,
      limit: 20,
      sort: { field: 'TITLE', direction: 'ASC' },
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        kind: 'folder',
        id: alpha.id,
        name: 'alpha',
        hasChildren: true,
      }),
      expect.objectContaining({
        kind: 'folder',
        id: zulu.id,
        name: 'Zulu',
        hasChildren: false,
      }),
    ]);
    expect(page.items[0]).not.toHaveProperty('sortOrder');

    await manager.lockProfile();
    expect(manager.localNotes).toBe(service);
    await expect(
      service.listChildren({
        parentFolderId: firstProfile.rootFolderId,
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_LOCKED' });

    const secondProfile = await manager.createProfile({
      displayName: 'Second',
      password: 'another correct horse battery staple',
    });
    expect(manager.localNotes).toBe(service);
    await expect(
      service.listChildren({
        parentFolderId: secondProfile.rootFolderId,
        limit: 20,
      }),
    ).resolves.toEqual({ items: [] });
    await expect(
      service.listChildren({
        parentFolderId: firstProfile.rootFolderId,
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    await manager.close();
  }, 60_000);
});
