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
import { createNoteExportCoordinator } from './export/coordinator';
import { createExportFileAccess } from './export/file-access';
import {
  createPdfRenderHost,
  type PdfHostIpcPort,
  type PdfHostSchedulerPort,
  type PdfHostWindowFactory,
} from './export/pdf-host';
import type { ExportDialogPort } from './export/types';
import { createAttachmentBindings } from './ipc/attachment-handlers';
import { createAppBindings } from './ipc/app-handlers';
import { createExportBindings } from './ipc/export-handlers';
import {
  createLocalNotesBindings,
  type SessionCommandGate,
} from './ipc/local-notes-handlers';
import {
  createProfileBindings,
  type ProfileRemovalConfirmation,
} from './ipc/profile-handlers';
import {
  createSettingsBindings,
  getUnlockedProfileId,
} from './ipc/settings-handlers';
import {
  registerIpcBindings,
  type IpcBinding,
  type IpcInvokeEventLike,
  type IpcMainPort,
} from './ipc/router';
import type { FileLogger } from './file-logger';
import {
  AutoLockController,
  type AutoLockLogger,
  type PowerMonitorPort,
  type SchedulerPort,
} from './lifecycle/auto-lock';
import { SessionLifecycle } from './lifecycle/session-lock';
import { createWindowCloseController } from './lifecycle/window-close';
import { OperationRegistry } from './operations/registry';

export interface RuntimeWindow {
  isDestroyed(): boolean;
  on(
    event: 'close',
    listener: (event: { preventDefault(): void }) => void,
  ): void;
  removeListener(
    event: 'close',
    listener: (event: { preventDefault(): void }) => void,
  ): void;
  close(): void;
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
  readonly ipcMain: IpcMainPort & PdfHostIpcPort;
  readonly protocol: MediaProtocolPort;
  readonly dialogs: AttachmentDialogPort & ExportDialogPort;
  readonly exportWindowFactory: PdfHostWindowFactory;
  readonly exportPreloadPath: string;
  readonly exportPageUrl: string;
  readonly powerMonitor: PowerMonitorPort;
  readonly scheduler: SchedulerPort & PdfHostSchedulerPort;
  readonly confirmation: ProfileRemovalConfirmation;
  readonly logger: AutoLockLogger;
  readonly diagnostics?: FileLogger;
  readonly diagnosticSessionId?: string;
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
  const expected = new Set(Object.keys(requestContracts));
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
  readonly profileManager?: ProfileManager;
  readonly sessionMedia?: { revokeAll(): void };
}): Promise<MainRuntime> {
  const manager =
    input.profileManager ??
    (await input.electron.createProfileManager({
      appDataRoot: input.appDataRoot,
    }));
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
    media: {
      revokeAll() {
        let failure: unknown;
        try {
          input.sessionMedia?.revokeAll();
        } catch (error) {
          failure = error;
        }
        try {
          media.revokeAll();
        } catch (error) {
          if (failure === undefined) failure = error;
        }
        if (failure !== undefined) throw failure;
      },
    },
    sink: {
      locked: (reason) => publisher.publish('profile.locked', { reason }),
    },
    randomUUID: input.electron.randomUUID,
  });
  const files = createAttachmentFileAccess({
    dialogs: input.electron.dialogs,
    randomUUID: input.electron.randomUUID,
  });
  const exportFiles = createExportFileAccess({
    dialogs: input.electron.dialogs,
    randomUUID: input.electron.randomUUID,
  });
  const pdfHost = createPdfRenderHost({
    factory: input.electron.exportWindowFactory,
    ipc: input.electron.ipcMain,
    service: manager.localAttachments,
    getSessionState: () => manager.getSessionState(),
    randomBytes: input.electron.randomBytes,
    now: input.electron.now,
    scheduler: input.electron.scheduler,
    preloadPath: input.electron.exportPreloadPath,
    pageUrl: input.electron.exportPageUrl,
  });
  const exportCoordinator = createNoteExportCoordinator({
    notes: manager.localNotes,
    attachments: manager.localAttachments,
    files: exportFiles,
    pdfHost,
    operations,
    gate: lifecycle,
    getLocale: () => manager.preferences.getDevice().language,
    now: input.electron.now,
  });
  const autoLock = new AutoLockController({
    powerMonitor: input.electron.powerMonitor,
    scheduler: input.electron.scheduler,
    lifecycle,
    getSessionState: () => manager.getSessionState(),
    getAutoLockMinutes: () => {
      const profileId = getUnlockedProfileId(() => manager.getSessionState());
      return manager.preferences.getProfile(profileId).autoLockMinutes;
    },
    now: input.electron.now,
    logger: input.electron.logger,
  });
  const windowClose = createWindowCloseController({
    publish: (payload) => publisher.publish('app.closeRequested', payload),
    close: () => input.window.close(),
    randomUUID: input.electron.randomUUID,
  });
  const onWindowClose = (event: { preventDefault(): void }) =>
    windowClose.request(event);
  const bindings = Object.freeze([
    ...createProfileBindings({
      manager,
      lifecycle,
      gate: lifecycle,
      confirmation: input.electron.confirmation,
      activity: autoLock,
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
    ...createExportBindings({
      coordinator: exportCoordinator,
      gate: lifecycle,
    }),
    ...createSettingsBindings({
      preferences: manager.preferences,
      gate: lifecycle,
      getLocalProfileId: () =>
        getUnlockedProfileId(() => manager.getSessionState()),
      activity: autoLock,
    }),
    ...createAppBindings({ closeController: windowClose }),
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
          logger: input.electron.diagnostics,
          now: input.electron.now,
          sessionId: input.electron.diagnosticSessionId,
        });
        autoLock.start();
        input.window.on('close', onWindowClose);
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
      try {
        input.window.removeListener('close', onWindowClose);
      } catch (error) {
        if (firstError === undefined) firstError = error;
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
        .then(async () => {
          try {
            await exportCoordinator.close();
          } catch (error) {
            if (firstError === undefined) firstError = error;
          }
          try {
            await pdfHost.close();
          } catch (error) {
            if (firstError === undefined) firstError = error;
          }
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
