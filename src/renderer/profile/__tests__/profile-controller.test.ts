import type { NoteraClient } from '../../platform/notera-client';
import { createProfileController } from '../profile-controller';

const profile = {
  state: 'UNLOCKED' as const,
  localProfileId: '10000000-0000-4000-8000-000000000001',
  displayName: 'Personal',
  rootFolderId: '20000000-0000-4000-8000-000000000001',
};

describe('profile controller', () => {
  it('dispatches a workspace transition after unlock succeeds', async () => {
    const dispatch = jest.fn();
    const client = {
      request: jest.fn().mockResolvedValue(profile),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    const controller = createProfileController({ client, dispatch });

    await controller.unlock({
      localProfileId: profile.localProfileId,
      password: 'secret',
    });

    expect(dispatch.mock.calls).toEqual([
      [
        {
          type: 'unlocking',
          localProfileId: profile.localProfileId,
        },
      ],
      [{ type: 'transitioning', profile }],
    ]);
  });

  it('returns to locked when unlock fails', async () => {
    const dispatch = jest.fn();
    const failure = new Error('unlock failed');
    const client = {
      request: jest.fn().mockRejectedValue(failure),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    const controller = createProfileController({ client, dispatch });

    await expect(
      controller.unlock({
        localProfileId: profile.localProfileId,
        password: 'secret',
      }),
    ).rejects.toBe(failure);
    expect(dispatch.mock.calls).toEqual([
      [
        {
          type: 'unlocking',
          localProfileId: profile.localProfileId,
        },
      ],
      [{ type: 'locked' }],
    ]);
  });
});
