import { ApplicationError } from '@notera/application';

import {
  ipcFailure,
  requestContracts,
  type IpcResponse,
} from '../../../shared';
import { mapIpcError } from '../errors';
import {
  defineIpcBinding,
  registerIpcBindings,
  type IpcInvokeEventLike,
  type IpcMainPort,
} from '../router';

class FakeIpcMain implements IpcMainPort {
  readonly listeners = new Map<
    string,
    (event: IpcInvokeEventLike, input: unknown) => Promise<unknown>
  >();

  readonly removed: string[] = [];

  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input: unknown) => Promise<unknown>,
  ): void {
    if (this.listeners.has(channel)) throw new Error('duplicate channel');
    this.listeners.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.removed.push(channel);
    this.listeners.delete(channel);
  }

  invoke(channel: string, event: IpcInvokeEventLike, input: unknown) {
    const listener = this.listeners.get(channel);
    if (listener === undefined) throw new Error('missing listener');
    return listener(event, input) as Promise<IpcResponse<unknown>>;
  }
}

const allowedEvent: IpcInvokeEventLike = {
  sender: { id: 7 },
  senderFrame: { routingId: 1, parent: null },
};

describe('validated Main IPC router', () => {
  it('validates the sender, request and successful response', async () => {
    const ipcMain = new FakeIpcMain();
    const invoke = jest.fn(() => ({ items: [] }));
    registerIpcBindings({
      ipcMain,
      senderPolicy: {
        allows: (event) =>
          event.sender.id === 7 && event.senderFrame?.parent === null,
      },
      bindings: [defineIpcBinding('profile.list', invoke)],
    });

    await expect(
      ipcMain.invoke(requestContracts['profile.list'].channel, allowedEvent, {
        limit: 10,
      }),
    ).resolves.toEqual({ ret: true, data: { items: [] } });
    expect(invoke).toHaveBeenCalledWith({ limit: 10 });

    await expect(
      ipcMain.invoke(requestContracts['profile.list'].channel, allowedEvent, {
        limit: 0,
      }),
    ).resolves.toEqual(ipcFailure('INVALID_IPC_REQUEST'));
    expect(invoke).toHaveBeenCalledTimes(1);

    await expect(
      ipcMain.invoke(
        requestContracts['profile.list'].channel,
        { sender: { id: 8 }, senderFrame: { routingId: 1, parent: null } },
        { limit: 10 },
      ),
    ).resolves.toEqual(ipcFailure('IPC_OPERATION_FAILED'));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('replaces invalid handler data without exposing it', async () => {
    const ipcMain = new FakeIpcMain();
    registerIpcBindings({
      ipcMain,
      senderPolicy: { allows: () => true },
      bindings: [
        defineIpcBinding('profile.list', () => ({
          items: [],
          leakedPath: 'C:\\private\\vault.db',
        })),
      ],
    });

    await expect(
      ipcMain.invoke(requestContracts['profile.list'].channel, allowedEvent, {
        limit: 10,
      }),
    ).resolves.toEqual(ipcFailure('IPC_OPERATION_FAILED'));
  });

  it('maps only contract-approved Application errors', () => {
    expect(
      mapIpcError(
        requestContracts['note.get'],
        new ApplicationError('ENTITY_NOT_FOUND'),
      ),
    ).toEqual(ipcFailure('ENTITY_NOT_FOUND'));
    expect(
      mapIpcError(
        requestContracts['profile.list'],
        new ApplicationError('ENTITY_NOT_FOUND'),
      ),
    ).toEqual(ipcFailure('IPC_OPERATION_FAILED'));
    expect(
      mapIpcError(
        requestContracts['note.get'],
        new Error('C:\\private\\vault.db'),
      ),
    ).toEqual(ipcFailure('IPC_OPERATION_FAILED'));
  });

  it('rejects duplicate bindings before registration and disposes once', () => {
    const ipcMain = new FakeIpcMain();
    const binding = defineIpcBinding('profile.list', () => ({ items: [] }));

    expect(() =>
      registerIpcBindings({
        ipcMain,
        senderPolicy: { allows: () => true },
        bindings: [binding, binding],
      }),
    ).toThrow('duplicate');
    expect(ipcMain.listeners.size).toBe(0);

    const dispose = registerIpcBindings({
      ipcMain,
      senderPolicy: { allows: () => true },
      bindings: [binding],
    });
    dispose();
    dispose();
    expect(ipcMain.removed).toEqual([requestContracts['profile.list'].channel]);
  });

  it('logs IPC validation and handler failures without request data', async () => {
    const ipcMain = new FakeIpcMain();
    const logger = { log: jest.fn(), error: jest.fn() };
    registerIpcBindings({
      ipcMain,
      senderPolicy: { allows: () => true },
      bindings: [
        defineIpcBinding('profile.list', () => {
          throw new Error('private note content');
        }),
      ],
      logger,
      now: () => 100,
    });
    await ipcMain.invoke(
      requestContracts['profile.list'].channel,
      allowedEvent,
      { limit: 0, password: 'secret' },
    );
    expect(logger.error).toHaveBeenCalledWith(
      'IPC_REQUEST_FAILED',
      expect.objectContaining({
        key: 'profile.list',
        errorCode: 'INVALID_IPC_REQUEST',
      }),
    );
    const details = logger.error.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(details).not.toHaveProperty('input');
  });
});
