import type { ProfileManager } from '@notera/application';

import { requestContracts } from '../../../shared';
import type { SessionCommandGate } from '../local-notes-handlers';
import {
  createProfileBindings,
  type ProfileHandlerDependencies,
} from '../profile-handlers';

const uuid = (value: number) =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const localProfileId = uuid(1);
const rootFolderId = uuid(2);
const session = {
  state: 'UNLOCKED' as const,
  localProfileId: localProfileId as never,
  displayName: 'Profile',
  rootFolderId: rootFolderId as never,
};

function setup(confirm = true) {
  const manager = {
    listProfiles: jest.fn(() => ({ items: [] })),
    getSessionState: jest.fn(() => ({ state: 'LOCKED' as const })),
    renameProfile: jest.fn(async () => ({
      localProfileId,
      displayName: 'Renamed',
      lastUsedAt: 1,
      isCurrent: true,
    })),
    changeProfilePassword: jest.fn(async () => undefined),
  } as unknown as ProfileManager;
  const lifecycle = {
    create: jest.fn(async () => session),
    unlock: jest.fn(async () => session),
    switch: jest.fn(async () => session),
    lock: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
  };
  const gateRun = jest.fn();
  const gate: SessionCommandGate = {
    run: <Result>(operation: () => Promise<Result> | Result) => {
      gateRun();
      return Promise.resolve().then(operation);
    },
  };
  const confirmation = {
    confirmRemove: jest.fn(async () => confirm),
  };
  const dependencies: ProfileHandlerDependencies = {
    manager,
    lifecycle,
    gate,
    confirmation,
  };
  return {
    bindings: createProfileBindings(dependencies),
    manager,
    lifecycle,
    gateRun,
    confirmation,
  };
}

function binding(
  bindings: ReturnType<typeof createProfileBindings>,
  key: keyof typeof requestContracts,
) {
  const found = bindings.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`Missing binding: ${key}`);
  return found;
}

describe('profile IPC handlers', () => {
  it('binds exactly the nine profile requests', () => {
    expect(setup().bindings.map((value) => value.key)).toEqual([
      'profile.list',
      'profile.getSessionState',
      'profile.create',
      'profile.unlock',
      'profile.lock',
      'profile.switch',
      'profile.rename',
      'profile.changePassword',
      'profile.removeFromDevice',
    ]);
  });

  it('maps manager, lifecycle, and gated profile operations', async () => {
    const state = setup();
    await expect(
      binding(state.bindings, 'profile.list').invoke({ limit: 20 }),
    ).resolves.toEqual({ items: [] });
    await expect(
      binding(state.bindings, 'profile.getSessionState').invoke({}),
    ).resolves.toEqual({ state: 'LOCKED' });
    await binding(state.bindings, 'profile.create').invoke({
      displayName: 'Profile',
      password: 'password',
    });
    await binding(state.bindings, 'profile.unlock').invoke({
      localProfileId,
      password: 'password',
    });
    await binding(state.bindings, 'profile.switch').invoke({
      localProfileId,
      password: 'password',
    });
    await expect(
      binding(state.bindings, 'profile.lock').invoke({}),
    ).resolves.toEqual({});
    await binding(state.bindings, 'profile.rename').invoke({
      displayName: 'Renamed',
    });
    await expect(
      binding(state.bindings, 'profile.changePassword').invoke({
        oldPassword: 'old',
        newPassword: 'new',
      }),
    ).resolves.toEqual({});

    expect(state.lifecycle.create).toHaveBeenCalledWith({
      displayName: 'Profile',
      password: 'password',
    });
    expect(state.lifecycle.unlock).toHaveBeenCalledWith({
      localProfileId,
      password: 'password',
    });
    expect(state.lifecycle.switch).toHaveBeenCalledWith({
      localProfileId,
      password: 'password',
    });
    expect(state.lifecycle.lock).toHaveBeenCalledWith('MANUAL');
    expect(state.manager.renameProfile).toHaveBeenCalledWith('Renamed');
    expect(state.manager.changeProfilePassword).toHaveBeenCalledWith({
      oldPassword: 'old',
      newPassword: 'new',
    });
    expect(state.gateRun).toHaveBeenCalledTimes(2);
  });

  it('returns cancelled before removal and removes only after confirmation', async () => {
    const cancelled = setup(false);
    await expect(
      binding(cancelled.bindings, 'profile.removeFromDevice').invoke({
        localProfileId,
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(cancelled.lifecycle.remove).not.toHaveBeenCalled();

    const confirmed = setup(true);
    await expect(
      binding(confirmed.bindings, 'profile.removeFromDevice').invoke({
        localProfileId,
      }),
    ).resolves.toEqual({ status: 'removed' });
    expect(confirmed.confirmation.confirmRemove).toHaveBeenCalledWith(
      localProfileId,
    );
    expect(confirmed.lifecycle.remove).toHaveBeenCalledWith(localProfileId);
  });
});
