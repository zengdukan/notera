import { ApplicationError } from '@notera/application';

import {
  AutoLockController,
  IDLE_POLL_MS,
  type PowerMonitorPort,
  type SchedulerPort,
} from '../auto-lock';

function settle() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function setup() {
  let now = 1_000_000;
  let state: 'LOCKED' | 'UNLOCKED' = 'UNLOCKED';
  let autoLockMinutes = 15;
  let timer: (() => void) | undefined;
  const listeners = new Map<string, () => void>();
  const powerMonitor: PowerMonitorPort = {
    on: jest.fn((event, listener) => listeners.set(event, listener)),
    removeListener: jest.fn((event, listener) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
  };
  const scheduler: SchedulerPort = {
    setInterval: jest.fn((callback) => {
      timer = callback;
      return 17;
    }),
    clearInterval: jest.fn(),
  };
  const lifecycle = { lock: jest.fn(async () => undefined) };
  const logger = { error: jest.fn() };
  const controller = new AutoLockController({
    powerMonitor,
    scheduler,
    lifecycle,
    getSessionState: () =>
      state === 'LOCKED'
        ? { state }
        : {
            state,
            localProfileId: '10000000-0000-4000-8000-000000000001' as never,
            displayName: 'Profile',
            rootFolderId: '10000000-0000-4000-8000-000000000002' as never,
          },
    getAutoLockMinutes: () => autoLockMinutes,
    now: () => now,
    logger,
  });
  return {
    controller,
    powerMonitor,
    scheduler,
    lifecycle,
    logger,
    listeners,
    advance(milliseconds: number) {
      now += milliseconds;
    },
    setMinutes(value: number) {
      autoLockMinutes = value;
    },
    setState(value: 'LOCKED' | 'UNLOCKED') {
      state = value;
    },
    tick() {
      if (timer === undefined) throw new Error('Timer missing.');
      timer();
    },
  };
}

describe('AutoLockController', () => {
  it('tracks renderer activity and applies the current profile timeout', async () => {
    const state = setup();
    state.controller.start();
    expect(state.scheduler.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      IDLE_POLL_MS,
    );
    state.advance(15 * 60_000 - 1);
    state.tick();
    await settle();
    expect(state.lifecycle.lock).not.toHaveBeenCalled();

    state.advance(1);
    state.tick();
    await settle();
    expect(state.lifecycle.lock).toHaveBeenCalledWith('IDLE_TIMEOUT');

    state.lifecycle.lock.mockClear();
    state.controller.touchActivity();
    state.setMinutes(1);
    state.advance(59_999);
    state.tick();
    await settle();
    expect(state.lifecycle.lock).not.toHaveBeenCalled();
    state.advance(1);
    state.tick();
    await settle();
    expect(state.lifecycle.lock).toHaveBeenCalledWith('IDLE_TIMEOUT');
  });

  it('locks immediately for system lock and suspend and is idempotent', async () => {
    const state = setup();
    state.controller.start();
    state.controller.start();
    state.listeners.get('lock-screen')?.();
    state.listeners.get('suspend')?.();
    await settle();
    expect(state.lifecycle.lock).toHaveBeenNthCalledWith(1, 'SYSTEM_LOCK');
    expect(state.lifecycle.lock).toHaveBeenNthCalledWith(2, 'SYSTEM_SUSPEND');
    state.controller.stop();
    state.controller.stop();
    expect(state.powerMonitor.removeListener).toHaveBeenCalledTimes(2);
    expect(state.scheduler.clearInterval).toHaveBeenCalledTimes(1);
  });

  it('does not timeout a locked profile and logs only fixed codes', async () => {
    const state = setup();
    state.controller.start();
    state.setState('LOCKED');
    state.advance(60 * 60_000);
    state.tick();
    await settle();
    expect(state.lifecycle.lock).not.toHaveBeenCalled();

    state.lifecycle.lock.mockRejectedValueOnce(
      new ApplicationError('PROFILE_LOCKED'),
    );
    state.listeners.get('lock-screen')?.();
    await settle();
    expect(state.logger.error).toHaveBeenCalledWith('PROFILE_LOCKED');
  });
});
