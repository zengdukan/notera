import type { ProfileManager } from '@notera/application';

import { eventContracts, requestContracts } from '../shared';
import {
  createAttachmentFileAccess,
  type AttachmentDialogPort,
} from './attachments/file-access';
import {
  createMediaGateway,
  type MediaProtocolPort,
} from './attachments/media-gateway';
import { createAttachmentBindings } from './ipc/attachment-handlers';
import {
  createLocalNotesBindings,
  type SessionCommandGate,
} from './ipc/local-notes-handlers';
import {
  createProfileBindings,
  type ProfileRemovalConfirmation,
} from './ipc/profile-handlers';
import {
  registerIpcBindings,
  type IpcBinding,
  type IpcInvokeEventLike,
  type IpcMainPort,
} from './ipc/router';
import {
  AutoLockController,
  type AutoLockLogger,
  type PowerMonitorPort,
  type SchedulerPort,
} from './lifecycle/auto-lock';
import { SessionLifecycle } from './lifecycle/session-lock';
import { OperationRegistry } from './operations/registry';

export interface RuntimeWindow {
  isDestroyed(): boolean;
  readonly webContents: {
    readonly id: number;
    readonly mainFrame: { readonly routingId: number };
    isDestroyed(): boolean;
    send(channel: string, payload: unknown): void;
  };
}

export interface MainElectronPorts {
  readonly createProfileManager: (input: {
    readonly appDataRoot: string;
  }) => Promise<ProfileManager>;
  readonly ipcMain: IpcMainPort;
  readonly protocol: MediaProtocolPort;
  readonly dialogs: AttachmentDialogPort;
  readonly powerMonitor: PowerMonitorPort;
  readonly scheduler: SchedulerPort;
  readonly confirmation: ProfileRemovalConfirmation;
  readonly logger: AutoLockLogger;
  readonly randomUUID: () => string;
  readonly randomBytes: () => Uint8Array;
  readonly now: () => number;
}

export interface MainRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
}

interface RuntimeEventContract {
  readonly channel: string;
  readonly payload: {
    safeParse(value: unknown): { success: boolean; data?: unknown };
  };
}

export function createEventPublisher(window: RuntimeWindow) {
  let target: RuntimeWindow | undefined = window;
  return Object.freeze({
    publish(key: keyof typeof eventContracts, payload: unknown): void {
      if (target === undefined || target.isDestroyed()) return;
      const contract = eventContracts[key] as RuntimeEventContract | undefined;
      if (contract === undefined) return;
      const parsed = contract.payload.safeParse(payload);
      if (!parsed.success || target.webContents.isDestroyed()) return;
      try {
        target.webContents.send(contract.channel, parsed.data);
      } catch {
        // A destroyed renderer cannot change Main state.
      }
    },
    close(): void {
      target = undefined;
    },
  });
}

function assertEnabledBindings(bindings: readonly IpcBinding[]): void {
  const expected = new Set(
    Object.keys(requestContracts).filter((key) => key !== 'export.startNote'),
  );
  const actual = new Set(bindings.map((binding) => binding.key));
  if (
    bindings.length !== expected.size ||
    actual.size !== expected.size ||
    [...expected].some((key) => !actual.has(key as never))
  ) {
    throw new Error('The enabled IPC bindings do not match the registry.');
  }
}

function senderPolicy(window: RuntimeWindow) {
  return {
    allows(event: IpcInvokeEventLike): boolean {
      return (
        !window.isDestroyed() &&
        !window.webContents.isDestroyed() &&
        event.sender.id === window.webContents.id &&
        event.senderFrame?.parent === null &&
        event.senderFrame.routingId === window.webContents.mainFrame.routingId
      );
    },
  };
}

export async function createMainRuntime(input: {
  readonly appDataRoot: string;
  readonly window: RuntimeWindow;
  readonly electron: MainElectronPorts;
}): Promise<MainRuntime> {
  const manager = await input.electron.createProfileManager({
    appDataRoot: input.appDataRoot,
  });
  const publisher = createEventPublisher(input.window);
  const operations = new OperationRegistry({
    sink: {
      progress: (payload) => publisher.publish('operation.progress', payload),
      completed: (payload) => publisher.publish('operation.completed', payload),
    },
    randomUUID: input.electron.randomUUID,
  });
  let lifecycle: SessionLifecycle | undefined;
  const lifecycleGate: SessionCommandGate = {
    run: <Result>(operation: () => Promise<Result> | Result) => {
      if (lifecycle === undefined) {
        return Promise.reject(
          new Error('The session lifecycle is unavailable.'),
        );
      }
      return lifecycle.run(operation);
    },
  };
  const media = createMediaGateway({
    protocol: input.electron.protocol,
    service: manager.localAttachments,
    gate: lifecycleGate,
    getSessionState: () => manager.getSessionState(),
    randomBytes: input.electron.randomBytes,
    now: input.electron.now,
  });
  lifecycle = new SessionLifecycle({
    manager,
    operations,
    media,
    sink: {
      locked: (reason) => publisher.publish('profile.locked', { reason }),
    },
    randomUUID: input.electron.randomUUID,
  });
  const files = createAttachmentFileAccess({
    dialogs: input.electron.dialogs,
    randomUUID: input.electron.randomUUID,
  });
  const autoLock = new AutoLockController({
    powerMonitor: input.electron.powerMonitor,
    scheduler: input.electron.scheduler,
    lifecycle,
    getSessionState: () => manager.getSessionState(),
    logger: input.electron.logger,
  });
  const bindings = Object.freeze([
    ...createProfileBindings({
      manager,
      lifecycle,
      gate: lifecycle,
      confirmation: input.electron.confirmation,
    }),
    ...createLocalNotesBindings({
      service: manager.localNotes,
      gate: lifecycle,
    }),
    ...createAttachmentBindings({
      service: manager.localAttachments,
      files,
      operations,
      gate: lifecycle,
      previewUrlProvider: media,
      now: input.electron.now,
    }),
  ]);
  assertEnabledBindings(bindings);

  let started = false;
  let closed = false;
  let disposeIpc: (() => void) | undefined;
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    async start(): Promise<void> {
      if (closed) throw new Error('The Main runtime is closed.');
      if (started) return;
      media.start();
      try {
        disposeIpc = registerIpcBindings({
          ipcMain: input.electron.ipcMain,
          senderPolicy: senderPolicy(input.window),
          bindings,
        });
        autoLock.start();
        started = true;
      } catch (error) {
        disposeIpc?.();
        disposeIpc = undefined;
        media.close();
        throw error;
      }
    },

    close(): Promise<void> {
      if (closePromise !== undefined) return closePromise;
      closed = true;
      let firstError: unknown;
      try {
        autoLock.stop();
      } catch (error) {
        firstError = error;
      }
      let lifecycleClose: Promise<void>;
      try {
        lifecycleClose = lifecycle?.close() ?? Promise.resolve();
      } catch (error) {
        if (firstError === undefined) firstError = error;
        lifecycleClose = Promise.resolve();
      }
      try {
        disposeIpc?.();
      } catch (error) {
        if (firstError === undefined) firstError = error;
      }
      disposeIpc = undefined;
      closePromise = lifecycleClose
        .catch((error: unknown) => {
          if (firstError === undefined) firstError = error;
        })
        .then(() => {
          try {
            media.close();
          } catch (error) {
            if (firstError === undefined) firstError = error;
          }
          publisher.close();
          if (firstError !== undefined) throw firstError;
          return undefined;
        });
      return closePromise;
    },
  });
}
