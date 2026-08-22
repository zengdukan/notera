import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('permanent local profile removal', () => {
  it('locks, isolates, removes the catalog entry, and permanently deletes files', async () => {
    const root = tempRoot();
    const manager = await createProfileManager({ appDataRoot: root });
    const created = await manager.createProfile({
      displayName: 'Disposable',
      password: 'password',
    });
    const profileRoot = join(root, 'profiles', created.localProfileId);
    expect(existsSync(profileRoot)).toBe(true);

    await manager.removeProfileFromDevice(created.localProfileId);
    expect(manager.getSessionState()).toEqual({ state: 'LOCKED' });
    expect(manager.listProfiles({ limit: 10 }).items).toEqual([]);
    expect(existsSync(profileRoot)).toBe(false);
    await expect(
      manager.unlockProfile({
        localProfileId: created.localProfileId,
        password: 'password',
      }),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    await expect(
      manager.removeProfileFromDevice(created.localProfileId),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    await manager.close();
  }, 30_000);
});
