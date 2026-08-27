import type { PreferencesStore } from '@notera/application';
import type { SessionCommandGate } from '../local-notes-handlers';
import { createSettingsBindings } from '../settings-handlers';

const profileId = '10000000-0000-4000-8000-000000000001';

describe('settings IPC handlers', () => {
  it('keeps device settings outside the gate and gates profile settings', async () => {
    const preferences = {
      getDevice: jest.fn(() => ({ theme: 'SYSTEM', language: 'en' })),
      updateDevice: jest.fn(async () => ({ theme: 'DARK', language: 'en' })),
      getProfile: jest.fn(() => ({ autoLockMinutes: 15 })),
      updateProfile: jest.fn(async () => ({ autoLockMinutes: 5 })),
    } as unknown as PreferencesStore;
    const gateRun = jest.fn();
    const gate: SessionCommandGate = {
      run: <Result>(operation: () => Promise<Result> | Result) => {
        gateRun();
        return Promise.resolve().then(operation);
      },
    };
    const activity = { touchActivity: jest.fn() };
    const bindings = createSettingsBindings({
      preferences,
      gate,
      getLocalProfileId: () => profileId,
      activity,
    });
    const invoke = (key: string, value: unknown) => {
      const found = bindings.find((binding) => binding.key === key);
      if (found === undefined) throw new Error(`Missing binding: ${key}`);
      return found.invoke(value);
    };

    await expect(invoke('settings.getDevice', {})).resolves.toEqual({
      theme: 'SYSTEM',
      language: 'en',
    });
    await invoke('settings.updateDevice', { theme: 'DARK' });
    await invoke('settings.getProfile', {});
    await invoke('settings.updateProfile', { autoLockMinutes: 5 });

    expect(gateRun).toHaveBeenCalledTimes(2);
    expect(preferences.getProfile).toHaveBeenCalledWith(profileId);
    expect(preferences.updateProfile).toHaveBeenCalledWith(profileId, {
      autoLockMinutes: 5,
    });
    expect(activity.touchActivity).toHaveBeenCalledTimes(1);
  });
});
