import { ApplicationError } from '@notera/application';

import {
  AUTO_LOCK_SECONDS,
  AutoLockController,
  IDLE_POLL_MS,
  type PowerMonitorPort,
  type SchedulerPort,
} from '../auto-lock';

function settle() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function setup() {
  let state: 'LOCKED' | 'UNLOCKED' = 'UNLOCKED';
  let idle = 0;
  let timer: (() => void) | undefined;
  const listeners = new Map<string, () => void>();
  const powerMonitor: PowerMonitorPort = {
    on: jest.fn((event, listener) => listeners.set(event, listener)),
    removeListener: jest.fn((event, listener) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
    getSystemIdleTime: jest.fn(() => idle),
  };
  const scheduler: SchedulerPort = {
    setInterval: jest.fn((callback) => {
      timer = callback;
      return 17;
    }),
    clearInterval: jest.fn(),
  };
  const lifecycle = {
    lock: jest.fn(async () => undefined),
  };
  const logger = { error: jest.fn() };
  const controller = new AutoLockController({
    powerMonitor,
    scheduler,
    lifecycle,
    getSessionState: () =>
      state === 'UNLOCKED'
        ? {
            state,
            localProfileId: '10000000-0000-4000-8000-000000000001' as never,
            displayName: 'Profile',
            rootFolderId: '10000000-0000-4000-8000-000000000002' as never,
          }
        : { state },
    logger,
  });
  return {
    controller,
    powerMonitor,
    scheduler,
    lifecycle,
    logger,
    listeners,
    setIdle(value: number) {
      idle = value;
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
  it('uses fixed timing and starts/stops exact listeners idempotently', () => {
    const state = setup();
    expect(AUTO_LOCK_SECONDS).toBe(15 * 60);
    expect(IDLE_POLL_MS).toBe(5_000);
    state.controller.start();
    state.controller.start();
    expect(state.powerMonitor.on).toHaveBeenCalledTimes(2);
    expect(state.scheduler.setInterval).toHaveBeenCalledTimes(1);
    expect(state.scheduler.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      IDLE_POLL_MS,
    );

    state.controller.stop();
    state.controller.stop();
    expect(state.powerMonitor.removeListener).toHaveBeenCalledTimes(2);
    expect(state.scheduler.clearInterval).toHaveBeenCalledTimes(1);
    expect(state.scheduler.clearInterval).toHaveBeenCalledWith(17);
    expect(state.listeners.size).toBe(0);
  });

  it('locks immediately for system lock and suspend events', async () => {
    const state = setup();
    state.controller.start();
    state.listeners.get('lock-screen')?.();
    state.listeners.get('suspend')?.();
    await settle();
    expect(state.lifecycle.lock).toHaveBeenNthCalledWith(1, 'SYSTEM_LOCK');
    expect(state.lifecycle.lock).toHaveBeenNthCalledWith(2, 'SYSTEM_SUSPEND');
  });

  it('locks at 900 idle seconds but not at 899 or while already locked', async () => {
    const state = setup();
    state.controller.start();
    state.setIdle(899);
    state.tick();
    await settle();
    expect(state.lifecycle.lock).not.toHaveBeenCalled();

    state.setIdle(900);
    state.tick();
    await settle();
    expect(state.lifecycle.lock).toHaveBeenCalledWith('IDLE_TIMEOUT');

    state.lifecycle.lock.mockClear();
    state.setState('LOCKED');
    state.tick();
    await settle();
    expect(state.lifecycle.lock).not.toHaveBeenCalled();
  });

  it('logs only a fixed code for asynchronous failures', async () => {
    const state = setup();
    state.lifecycle.lock.mockRejectedValueOnce(
      new ApplicationError('PROFILE_LOCKED'),
    );
    state.lifecycle.lock.mockRejectedValueOnce(
      new Error('C:\\private\\profile'),
    );
    state.controller.start();
    state.listeners.get('lock-screen')?.();
    state.listeners.get('suspend')?.();
    await settle();
    expect(state.logger.error).toHaveBeenNthCalledWith(1, 'PROFILE_LOCKED');
    expect(state.logger.error).toHaveBeenNthCalledWith(
      2,
      'IPC_OPERATION_FAILED',
    );
  });
});
