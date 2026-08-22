import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('ProfileManager production integration', () => {
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
