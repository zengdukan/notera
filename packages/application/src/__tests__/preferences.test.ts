import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createPreferencesStore } from '../preferences';
import { cleanupTempRoots, localProfileId, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('preferences store', () => {
  it('uses locale-aware device defaults and the safe profile timeout', async () => {
    const chinese = await createPreferencesStore({
      appDataRoot: tempRoot(),
      systemLocale: 'zh-TW',
    });
    expect(chinese.getDevice()).toEqual({ theme: 'SYSTEM', language: 'zh-CN' });
    expect(chinese.getProfile(localProfileId(1))).toEqual({
      autoLockMinutes: 15,
    });

    const english = await createPreferencesStore({
      appDataRoot: tempRoot(),
      systemLocale: 'fr-FR',
    });
    expect(english.getDevice().language).toBe('en');
  });

  it('persists strict updates per profile and removes only the target profile', async () => {
    const root = tempRoot();
    const firstId = localProfileId(1);
    const secondId = localProfileId(2);
    const store = await createPreferencesStore({
      appDataRoot: root,
      systemLocale: 'en-US',
    });
    await store.updateDevice({ theme: 'DARK', language: 'zh-CN' });
    await store.updateProfile(firstId, { autoLockMinutes: 5 });
    await store.updateProfile(secondId, { autoLockMinutes: 60 });
    await store.removeProfile(firstId);

    const reopened = await createPreferencesStore({
      appDataRoot: root,
      systemLocale: 'en-US',
    });
    expect(reopened.getDevice()).toEqual({ theme: 'DARK', language: 'zh-CN' });
    expect(reopened.getProfile(firstId)).toEqual({ autoLockMinutes: 15 });
    expect(reopened.getProfile(secondId)).toEqual({ autoLockMinutes: 60 });
  });

  it('falls back without exposing corrupt preference contents', async () => {
    const root = tempRoot();
    await writeFile(join(root, 'preferences.json'), '{"password":"secret"}');
    const store = await createPreferencesStore({
      appDataRoot: root,
      systemLocale: 'en-US',
    });
    expect(store.getDevice()).toEqual({ theme: 'SYSTEM', language: 'en' });
  });
});
