import {
  ApplicationError,
  type ProfileManager,
  type SessionState,
} from '@notera/application';

import { SessionLifecycle } from '../session-lock';

const uuid = (value: number) =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const firstProfileId = uuid(1);
const secondProfileId = uuid(2);
const rootFolderId = uuid(3);

function deferred() {
  let complete!: () => void;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: complete };
}

function setup(initial: SessionState = { state: 'LOCKED' }) {
  let state = initial;
  let epoch = 0;
  const calls: string[] = [];
  const unlocked = (localProfileId: string) => ({
    state: 'UNLOCKED' as const,
    localProfileId: localProfileId as never,
    displayName: 'Profile',
    rootFolderId: rootFolderId as never,
  });
  const manager = {
    getSessionState: jest.fn(() => state),
    createProfile: jest.fn(async () => {
      calls.push('manager.create');
      state = unlocked(firstProfileId);
      return state;
    }),
    unlockProfile: jest.fn(async (input: { localProfileId: string }) => {
      calls.push('manager.unlock');
      state = unlocked(input.localProfileId);
      return state;
    }),
    switchProfile: jest.fn(async (input: { localProfileId: string }) => {
      calls.push('manager.switch');
      state = unlocked(input.localProfileId);
      return state;
    }),
    lockProfile: jest.fn(async () => {
      calls.push('manager.lock');
      state = { state: 'LOCKED' };
    }),
    removeProfileFromDevice: jest.fn(async (localProfileId: string) => {
      calls.push(`manager.remove:${localProfileId}`);
    }),
    close: jest.fn(async () => {
      calls.push('manager.close');
      state = { state: 'LOCKED' };
    }),
  } as unknown as ProfileManager;
  const operations = {
    beginSession: jest.fn((value: string) =>
      calls.push(`operations.begin:${value}`),
    ),
    endSession: jest.fn(async () => {
      calls.push('operations.end');
    }),
  };
  const media = {
    revokeAll: jest.fn(() => calls.push('media.revoke')),
  };
  const sink = {
    locked: jest.fn((reason: string) => calls.push(`event:${reason}`)),
  };
  const lifecycle = new SessionLifecycle({
    manager,
    operations,
    media,
    sink,
    randomUUID: () => {
      epoch += 1;
      return `epoch-${epoch}`;
    },
  });
  calls.length = 0;
  operations.beginSession.mockClear();

  return {
    lifecycle,
    manager,
    operations,
    media,
    sink,
    calls,
    unlocked,
    setState(value: SessionState) {
      state = value;
    },
  };
}

describe('SessionLifecycle', () => {
  it('rejects a locked or transitioning gate and opens a new epoch after create', async () => {
    const state = setup();
    await expect(state.lifecycle.run(() => 'no')).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });

    const pending = deferred();
    (state.manager.createProfile as jest.Mock).mockImplementationOnce(
      async () => {
        await pending.promise;
        state.setState(state.unlocked(firstProfileId));
        return state.unlocked(firstProfileId);
      },
    );
    const creating = state.lifecycle.create({
      displayName: 'Profile',
      password: 'password',
    });
    await expect(state.lifecycle.run(() => 'no')).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });
    pending.resolve();
    await expect(creating).resolves.toMatchObject({
      state: 'UNLOCKED',
      localProfileId: firstProfileId as never,
    });
    await expect(state.lifecycle.run(() => 'yes')).resolves.toBe('yes');
    expect(state.operations.beginSession).toHaveBeenCalledWith('epoch-1');
  });

  it('opens a new epoch after unlock', async () => {
    const state = setup();
    await state.lifecycle.unlock({
      localProfileId: firstProfileId as never,
      password: 'password',
    });
    expect(state.manager.unlockProfile).toHaveBeenCalledWith({
      localProfileId: firstProfileId,
      password: 'password',
    });
    expect(state.operations.beginSession).toHaveBeenCalledWith('epoch-1');
    await expect(state.lifecycle.run(() => 1)).resolves.toBe(1);
  });

  it('clears the old session before switching and stays locked on failure', async () => {
    const state = setup({
      state: 'UNLOCKED',
      localProfileId: firstProfileId as never,
      displayName: 'First',
      rootFolderId: rootFolderId as never,
    });
    await state.lifecycle.switch({
      localProfileId: secondProfileId as never,
      password: 'password',
    });
    expect(state.calls).toEqual([
      'event:SWITCHED',
      'operations.end',
      'media.revoke',
      'manager.switch',
      'operations.begin:epoch-2',
    ]);
    await expect(state.lifecycle.run(() => 'open')).resolves.toBe('open');

    const failed = setup({
      state: 'UNLOCKED',
      localProfileId: firstProfileId as never,
      displayName: 'First',
      rootFolderId: rootFolderId as never,
    });
    (failed.manager.switchProfile as jest.Mock).mockImplementationOnce(
      async () => {
        failed.calls.push('manager.switch');
        throw new ApplicationError('WRONG_PASSWORD');
      },
    );
    await expect(
      failed.lifecycle.switch({
        localProfileId: secondProfileId as never,
        password: 'wrong',
      }),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(failed.lifecycle.run(() => 'no')).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });
    expect(failed.calls).toEqual([
      'event:SWITCHED',
      'operations.end',
      'media.revoke',
      'manager.switch',
    ]);
  });

  it('merges concurrent locks and closes resources in the fixed order', async () => {
    const state = setup({
      state: 'UNLOCKED',
      localProfileId: firstProfileId as never,
      displayName: 'First',
      rootFolderId: rootFolderId as never,
    });
    const pending = deferred();
    state.operations.endSession.mockImplementationOnce(async () => {
      state.calls.push('operations.end');
      await pending.promise;
    });

    const first = state.lifecycle.lock('MANUAL');
    const second = state.lifecycle.lock('SYSTEM_LOCK');
    expect(second).toBe(first);
    await expect(state.lifecycle.run(() => 'no')).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });
    pending.resolve();
    await first;
    expect(state.calls).toEqual([
      'operations.end',
      'media.revoke',
      'manager.lock',
      'event:MANUAL',
    ]);
    await state.lifecycle.lock('IDLE_TIMEOUT');
    expect(state.operations.endSession).toHaveBeenCalledTimes(1);
    expect(state.sink.locked).toHaveBeenCalledTimes(1);
  });

  it('only locks before removing the current profile', async () => {
    const other = setup({
      state: 'UNLOCKED',
      localProfileId: firstProfileId as never,
      displayName: 'First',
      rootFolderId: rootFolderId as never,
    });
    await other.lifecycle.remove(secondProfileId);
    expect(other.calls).toEqual([`manager.remove:${secondProfileId}`]);
    await expect(other.lifecycle.run(() => 'open')).resolves.toBe('open');

    const current = setup({
      state: 'UNLOCKED',
      localProfileId: firstProfileId as never,
      displayName: 'First',
      rootFolderId: rootFolderId as never,
    });
    await current.lifecycle.remove(firstProfileId);
    expect(current.calls).toEqual([
      'operations.end',
      'media.revoke',
      'manager.lock',
      'event:MANUAL',
      `manager.remove:${firstProfileId}`,
    ]);
  });

  it('closes idempotently, rejects new work immediately, and only emits when unlocked', async () => {
    const state = setup({
      state: 'UNLOCKED',
      localProfileId: firstProfileId as never,
      displayName: 'First',
      rootFolderId: rootFolderId as never,
    });
    const pending = deferred();
    (state.manager.close as jest.Mock).mockImplementationOnce(async () => {
      state.calls.push('manager.close');
      await pending.promise;
    });
    const first = state.lifecycle.close();
    const second = state.lifecycle.close();
    expect(second).toBe(first);
    await expect(state.lifecycle.run(() => 'no')).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });
    pending.resolve();
    await first;
    expect(state.calls).toEqual([
      'operations.end',
      'media.revoke',
      'manager.close',
      'event:SESSION_CLOSED',
    ]);

    const locked = setup();
    await locked.lifecycle.close();
    expect(locked.sink.locked).not.toHaveBeenCalled();
    expect(locked.manager.close).toHaveBeenCalledTimes(1);
  });
});
