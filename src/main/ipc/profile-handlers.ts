import type { ProfileManager } from '@notera/application';

import type { SessionLifecycle } from '../lifecycle/session-lock';
import type { SessionCommandGate } from './local-notes-handlers';
import { defineIpcBinding, type IpcBinding } from './router';

export interface ProfileRemovalConfirmation {
  confirmRemove(localProfileId: string): Promise<boolean>;
}

export interface ProfileHandlerDependencies {
  readonly manager: ProfileManager;
  readonly lifecycle: Pick<
    SessionLifecycle,
    'create' | 'unlock' | 'switch' | 'lock' | 'remove'
  >;
  readonly gate: SessionCommandGate;
  readonly confirmation: ProfileRemovalConfirmation;
}

export function createProfileBindings(
  input: ProfileHandlerDependencies,
): readonly IpcBinding[] {
  return Object.freeze([
    defineIpcBinding('profile.list', (value) =>
      input.manager.listProfiles(
        value as Parameters<ProfileManager['listProfiles']>[0],
      ),
    ),
    defineIpcBinding('profile.getSessionState', () =>
      input.manager.getSessionState(),
    ),
    defineIpcBinding('profile.create', (value) =>
      input.lifecycle.create(
        value as Parameters<ProfileManager['createProfile']>[0],
      ),
    ),
    defineIpcBinding('profile.unlock', (value) =>
      input.lifecycle.unlock(
        value as Parameters<ProfileManager['unlockProfile']>[0],
      ),
    ),
    defineIpcBinding('profile.lock', async () => {
      await input.lifecycle.lock('MANUAL');
      return {};
    }),
    defineIpcBinding('profile.switch', (value) =>
      input.lifecycle.switch(
        value as Parameters<ProfileManager['switchProfile']>[0],
      ),
    ),
    defineIpcBinding('profile.rename', (value) =>
      input.gate.run(() => input.manager.renameProfile(value.displayName)),
    ),
    defineIpcBinding('profile.changePassword', (value) =>
      input.gate.run(async () => {
        await input.manager.changeProfilePassword(value);
        return {};
      }),
    ),
    defineIpcBinding('profile.removeFromDevice', async (value) => {
      const confirmed = await input.confirmation.confirmRemove(
        value.localProfileId,
      );
      if (!confirmed) return { status: 'cancelled' as const };
      await input.lifecycle.remove(value.localProfileId);
      return { status: 'removed' as const };
    }),
  ]);
}
