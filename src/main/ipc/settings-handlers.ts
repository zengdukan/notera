import {
  ApplicationError,
  type PreferencesStore,
  type ThemePreference,
} from '@notera/application';

import type { SessionCommandGate } from './local-notes-handlers';
import { defineIpcBinding, type IpcBinding } from './router';

export interface NativeThemePort {
  setThemeSource(source: 'system' | 'light' | 'dark'): void;
}

export function nativeThemeSource(
  preference: ThemePreference,
): 'system' | 'light' | 'dark' {
  if (preference === 'LIGHT') return 'light';
  if (preference === 'DARK') return 'dark';
  return 'system';
}

export function createSettingsBindings(input: {
  readonly preferences: PreferencesStore;
  readonly gate: SessionCommandGate;
  readonly getLocalProfileId: () => string;
  readonly activity: { touchActivity(): void };
  readonly nativeTheme: NativeThemePort;
}): readonly IpcBinding[] {
  return Object.freeze([
    defineIpcBinding('settings.getDevice', () => input.preferences.getDevice()),
    defineIpcBinding('settings.updateDevice', async (value) => {
      const result = await input.preferences.updateDevice(value);
      if (result.theme !== undefined) {
        input.nativeTheme.setThemeSource(nativeThemeSource(result.theme));
      }
      return result;
    }),
    defineIpcBinding('settings.getProfile', () =>
      input.gate.run(() =>
        input.preferences.getProfile(input.getLocalProfileId()),
      ),
    ),
    defineIpcBinding('settings.updateProfile', (value) =>
      input.gate.run(async () => {
        const result = await input.preferences.updateProfile(
          input.getLocalProfileId(),
          value,
        );
        input.activity.touchActivity();
        return result;
      }),
    ),
  ]);
}

export function getUnlockedProfileId(
  getSessionState: () =>
    | { readonly state: 'LOCKED' }
    | { readonly state: 'UNLOCKED'; readonly localProfileId: string },
): string {
  const state = getSessionState();
  if (state.state !== 'UNLOCKED') {
    throw new ApplicationError('PROFILE_LOCKED');
  }
  return state.localProfileId;
}
