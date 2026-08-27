import type { Dispatch } from 'react';

import type { NoteraClient } from '../platform/notera-client';
import type { SessionAction } from '../app/session';

export function createProfileController(input: {
  readonly client: NoteraClient;
  readonly dispatch: Dispatch<SessionAction>;
}) {
  const unlockWith = async (
    localProfileId: string,
    operation: () => ReturnType<NoteraClient['request']>,
  ) => {
    input.dispatch({ type: 'unlocking', localProfileId });
    try {
      const profile = await operation();
      if (!('state' in profile) || profile.state !== 'UNLOCKED') {
        throw new Error('Invalid unlocked profile response.');
      }
      input.dispatch({ type: 'unlocked', profile });
    } catch (error) {
      input.dispatch({ type: 'locked' });
      throw error;
    }
  };

  return Object.freeze({
    create(value: { readonly displayName: string; readonly password: string }) {
      return unlockWith('new', () =>
        input.client.request('profile.create', value),
      );
    },
    unlock(value: {
      readonly localProfileId: string;
      readonly password: string;
    }) {
      return unlockWith(value.localProfileId, () =>
        input.client.request('profile.unlock', value),
      );
    },
    async lock() {
      await input.client.request('profile.lock', {});
    },
  });
}
