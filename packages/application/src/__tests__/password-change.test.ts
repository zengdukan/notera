import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('atomic profile password changes', () => {
  it('commits a new password while preserving profile identity and session access', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const created = await manager.createProfile({
      displayName: 'Profile',
      password: 'old password',
    });

    await expect(
      manager.changeProfilePassword({
        oldPassword: 'wrong password',
        newPassword: 'unused password',
      }),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(manager.getSessionState()).toEqual(created);

    await manager.changeProfilePassword({
      oldPassword: 'old password',
      newPassword: 'new password',
    });
    expect(manager.getSessionState()).toEqual(created);
    await manager.lockProfile();
    await expect(
      manager.unlockProfile({
        localProfileId: created.localProfileId,
        password: 'old password',
      }),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    const reopened = await manager.unlockProfile({
      localProfileId: created.localProfileId,
      password: 'new password',
    });
    expect(reopened.rootFolderId).toBe(created.rootFolderId);
    await manager.close();
  }, 60_000);
});
