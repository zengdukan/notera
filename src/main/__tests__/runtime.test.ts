import type { SessionState } from '@notera/application';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eventContracts, requestContracts } from '../../shared';
import {
  createEventPublisher,
  createMainRuntime,
  type MainElectronPorts,
} from '../runtime';
import {
  createProfileManagerFake,
  createRuntimeWindowFake,
  uuid,
} from './helpers';

function deferred() {
  let complete!: () => void;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: complete };
}

function setup(initialState: SessionState = { state: 'LOCKED' }) {
  const calls: string[] = [];
  const profile = createProfileManagerFake(initialState);
  const runtimeWindow = createRuntimeWindowFake();
  const handlers = new Map<string, unknown>();
  const powerListeners = new Map<string, () => void>();
  let random = 0;
  const electron: MainElectronPorts = {
    createProfileManager: jest.fn(async () => profile.manager),
    ipcMain: {
      handle: jest.fn((channel, listener) => {
        calls.push(`ipc.handle:${channel}`);
        handlers.set(channel, listener);
      }),
      removeHandler: jest.fn((channel) => {
        calls.push(`ipc.remove:${channel}`);
        handlers.delete(channel);
      }),
      on: jest.fn(),
      removeListener: jest.fn(),
    },
    protocol: {
      handle: jest.fn(() => {
        calls.push('protocol.handle');
      }),
      unhandle: jest.fn(() => calls.push('protocol.unhandle')),
    },
    dialogs: {
      chooseImportPath: jest.fn(async () => null),
      chooseSavePath: jest.fn(async () => null),
      chooseExportPath: jest.fn(async () => null),
    },
    exportWindowFactory: {
      create: jest.fn(() => {
        throw new Error('The export window must not open in this test.');
      }),
    },
    exportPreloadPath: 'D:\\app\\export-preload.js',
    exportPageUrl: 'file:///D:/app/renderer/export.html',
    powerMonitor: {
      on: jest.fn((event, listener) => powerListeners.set(event, listener)),
      removeListener: jest.fn((event, listener) => {
        if (powerListeners.get(event) === listener)
          powerListeners.delete(event);
      }),
    },
    scheduler: {
      setInterval: jest.fn(() => 1),
      clearInterval: jest.fn(),
      setTimeout: jest.fn(() => 2),
      clearTimeout: jest.fn(),
    },
    confirmation: {
      confirmRemove: jest.fn(async () => true),
    },
    logger: { error: jest.fn() },
    randomUUID: () => {
      random += 1;
      return uuid(random);
    },
    randomBytes: () => new Uint8Array(32),
    now: () => Date.now(),
  };
  return {
    create: () =>
      createMainRuntime({
        appDataRoot: 'D:\\notera-test',
        window: runtimeWindow.window,
        electron,
      }),
    electron,
    profile,
    runtimeWindow,
    handlers,
    calls,
  };
}

describe('MainRuntime', () => {
  it('registers exactly all 62 bindings including settings and close', async () => {
    const state = setup();
    const runtime = await state.create();
    await runtime.start();

    const enabled = Object.values(requestContracts)
      .map((contract) => contract.channel)
      .sort();
    expect([...state.handlers.keys()].sort()).toEqual(enabled);
    expect(state.handlers.size).toBe(62);
    expect(
      state.handlers.has(requestContracts['export.startNote'].channel),
    ).toBe(true);
    expect(state.handlers.has(requestContracts['settings.getDevice'].channel)).toBe(true);
    expect(state.handlers.has(requestContracts['app.completeClose'].channel)).toBe(true);
    expect(state.calls[0]).toBe('protocol.handle');
    await runtime.close();
  });

  it('publishes only validated fixed events and stops after window destruction', () => {
    const runtimeWindow = createRuntimeWindowFake();
    const publisher = createEventPublisher(runtimeWindow.window);
    publisher.publish('profile.locked', { reason: 'SYSTEM_LOCK' });
    publisher.publish('profile.locked', {
      reason: 'UNKNOWN',
      path: 'D:\\private',
    });
    publisher.publish('unknown' as never, { secret: true });

    expect(runtimeWindow.send).toHaveBeenCalledTimes(1);
    expect(runtimeWindow.send).toHaveBeenCalledWith(
      eventContracts['profile.locked'].channel,
      { reason: 'SYSTEM_LOCK' },
    );

    runtimeWindow.destroy();
    publisher.publish('profile.locked', { reason: 'MANUAL' });
    expect(runtimeWindow.send).toHaveBeenCalledTimes(1);
  });

  it('closes concurrently, removes handlers immediately, and cleans each owner once', async () => {
    const state = setup({
      state: 'UNLOCKED',
      localProfileId: uuid(1) as never,
      displayName: 'Profile',
      rootFolderId: uuid(2) as never,
    });
    const pending = deferred();
    (state.profile.manager.close as jest.Mock).mockImplementationOnce(
      () => pending.promise,
    );
    const runtime = await state.create();
    await runtime.start();

    const first = runtime.close();
    const second = runtime.close();
    expect(second).toBe(first);
    expect(state.handlers.size).toBe(0);
    expect(state.electron.ipcMain.removeHandler).toHaveBeenCalledTimes(62);
    pending.resolve();
    await first;
    expect(state.profile.manager.close).toHaveBeenCalledTimes(1);
    expect(state.electron.protocol.unhandle).toHaveBeenCalledTimes(1);
    expect(state.electron.scheduler.clearInterval).toHaveBeenCalledTimes(1);
  });

  it('keeps export protocol, preload, page, and save filters in Main only', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/main/main.ts'),
      'utf8',
    );
    expect(source).toContain("scheme: 'notera-media'");
    expect(source).toContain("scheme: 'notera-export-media'");
    expect(source).toContain("'export-preload.js'");
    expect(source).toContain("resolveHtmlPath('export.html')");
    expect(source).toContain('chooseExportPath');
    expect(source).toContain('extensions: [extension]');
  });

  it('continues protocol cleanup when lifecycle close fails', async () => {
    const state = setup();
    (state.profile.manager.close as jest.Mock).mockRejectedValueOnce(
      new Error('fixed close failure'),
    );
    const runtime = await state.create();
    await runtime.start();

    await expect(runtime.close()).rejects.toThrow('fixed close failure');
    expect(state.electron.protocol.unhandle).toHaveBeenCalledTimes(1);
    expect(state.handlers.size).toBe(0);
  });
});
