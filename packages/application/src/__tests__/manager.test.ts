import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('ProfileManager lifecycle gate', () => {
  it('validates names and passwords before creating persistent state', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    await expect(
      manager.createProfile({ displayName: ' ', password: 'password' }),
    ).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(
      manager.createProfile({ displayName: 'Profile', password: '' }),
    ).rejects.toMatchObject({ code: 'OPERATION_FAILED' });
    expect(manager.listProfiles({ limit: 10 }).items).toEqual([]);
    await manager.close();
    await manager.close();
  });

  it('keeps the manager locked when switching to an unknown profile', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    await expect(
      manager.switchProfile({
        localProfileId: '40000000-0000-4000-8000-000000000001' as never,
        password: 'password',
      }),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    expect(manager.getSessionState()).toEqual({ state: 'LOCKED' });
    await manager.close();
  });
});
