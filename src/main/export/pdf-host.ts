import {
  ApplicationError,
  type LocalAttachmentsService,
  type SessionState,
} from '@notera/application';

import {
  EXPORT_RENDER_CHANNELS,
  exportRenderFailureSchema,
  exportRenderReadySchema,
  exportRenderDocumentSchema,
} from '../../shared';
import { MainIpcError } from '../ipc/errors';
import { secureExportPdf } from './pdf-postprocess';
import {
  createExportResourceLease,
  type ExportResourceProtocolPort,
} from './resource-leases';
import type { PdfRenderHost } from './types';

type Listener = (...args: any[]) => void;

export interface PdfHostSessionPort {
  readonly protocol: ExportResourceProtocolPort;
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (allowed: boolean) => void,
    ) => void,
  ): void;
  setPermissionCheckHandler(handler: () => boolean): void;
  on(event: 'will-download', listener: Listener): void;
  removeListener?(event: 'will-download', listener: Listener): void;
}

export interface PdfHostWebContentsPort {
  readonly id: number;
  readonly session: PdfHostSessionPort;
  send(channel: string, payload: unknown): void;
  printToPDF(options: {
    readonly pageSize: 'A4';
    readonly printBackground: true;
    readonly margins: {
      readonly top: 0;
      readonly bottom: 0;
      readonly left: 0;
      readonly right: 0;
    };
  }): Promise<Uint8Array>;
  on(event: string, listener: Listener): void;
  removeListener(event: string, listener: Listener): void;
  setWindowOpenHandler(
    handler: (input: { readonly url: string }) => { action: 'deny' },
  ): void;
}

export interface PdfHostWindowPort {
  readonly webContents: PdfHostWebContentsPort;
  loadURL(url: string): Promise<unknown> | unknown;
  destroy(): void;
  isDestroyed(): boolean;
  on(event: string, listener: Listener): void;
  removeListener(event: string, listener: Listener): void;
}

export interface PdfHostWindowFactory {
  create(options: {
    readonly show: false;
    readonly width: number;
    readonly height: number;
    readonly webPreferences: {
      readonly preload: string;
      readonly partition: string;
      readonly sandbox: true;
      readonly contextIsolation: true;
      readonly nodeIntegration: false;
      readonly webSecurity: true;
      readonly devTools: false;
    };
  }): PdfHostWindowPort;
}

export interface PdfHostIpcPort {
  on(
    channel: string,
    listener: (event: { readonly sender: unknown }, payload: unknown) => void,
  ): void;
  removeListener(
    channel: string,
    listener: (event: { readonly sender: unknown }, payload: unknown) => void,
  ): void;
}

interface SchedulerPort {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

function validPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.search || url.hash || !url.pathname.endsWith('/export.html'))
      return false;
    if (url.protocol === 'file:') return true;
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.pathname === '/export.html'
    );
  } catch {
    return false;
  }
}

function mapped(error: unknown, signal: AbortSignal): Error {
  if (error instanceof ApplicationError || error instanceof MainIpcError)
    return error;
  if (signal.aborted) return new ApplicationError('OPERATION_ABORTED');
  return new MainIpcError('EXPORT_FAILED');
}

function denyWindow(window: PdfHostWindowPort, pageUrl: string) {
  const webContents = window.webContents;
  const preventNavigation = (
    event: { preventDefault(): void },
    candidate: string,
  ) => {
    if (candidate !== pageUrl) event.preventDefault();
  };
  const preventWebview = (event: { preventDefault(): void }) =>
    event.preventDefault();
  const preventDownload = (event: { preventDefault(): void }) =>
    event.preventDefault();
  webContents.on('will-navigate', preventNavigation);
  webContents.on('will-redirect', preventNavigation);
  webContents.on('will-attach-webview', preventWebview);
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  webContents.session.setPermissionCheckHandler(() => false);
  webContents.session.on('will-download', preventDownload);
  return () => {
    webContents.removeListener('will-navigate', preventNavigation);
    webContents.removeListener('will-redirect', preventNavigation);
    webContents.removeListener('will-attach-webview', preventWebview);
    webContents.session.removeListener?.('will-download', preventDownload);
  };
}

export function createPdfRenderHost(input: {
  readonly factory: PdfHostWindowFactory;
  readonly ipc: PdfHostIpcPort;
  readonly service: LocalAttachmentsService;
  readonly getSessionState: () => SessionState;
  readonly randomBytes: () => Uint8Array;
  readonly now: () => number;
  readonly scheduler: SchedulerPort;
  readonly preloadPath: string;
  readonly pageUrl: string;
}): PdfRenderHost {
  if (!validPageUrl(input.pageUrl))
    throw new TypeError('Invalid export page URL.');
  let active:
    | {
        readonly controller: AbortController;
        readonly promise: Promise<unknown>;
      }
    | undefined;

  const render: PdfRenderHost['render'] = async (value) => {
    if (active !== undefined) throw new MainIpcError('EXPORT_FAILED');
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    value.signal.addEventListener('abort', relayAbort, { once: true });
    if (value.signal.aborted) controller.abort();

    const run = (async () => {
      let state: SessionState;
      try {
        state = input.getSessionState();
      } catch {
        throw new ApplicationError('PROFILE_LOCKED');
      }
      if (state.state !== 'UNLOCKED')
        throw new ApplicationError('PROFILE_LOCKED');
      const random = input.randomBytes();
      if (random.byteLength !== 32) throw new MainIpcError('EXPORT_FAILED');
      const nonce = Buffer.from(random).toString('base64url');
      const window = input.factory.create({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
          preload: input.preloadPath,
          partition: `notera-export-${value.operationId}`,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          devTools: false,
        },
      });
      const removeDenials = denyWindow(window, input.pageUrl);
      const lease = createExportResourceLease({
        protocol: window.webContents.session.protocol,
        service: input.service,
        getSessionState: input.getSessionState,
        expectedProfileId: state.localProfileId,
        operationId: value.operationId,
        token: nonce,
        expiresAt: input.now() + 60_000,
        now: input.now,
        assets: value.assets,
        signal: controller.signal,
        onBytes: value.onResourceBytes,
      });
      lease.start();
      const payload = exportRenderDocumentSchema.parse({
        operationId: value.operationId,
        nonce,
        title: value.title,
        document: value.document,
        mediaBaseUrl: lease.baseUrl,
        attachments: value.assets,
      });

      const listeners: Array<readonly [object, string, Listener]> = [];
      let timeout: unknown;
      const listen = (
        target: { on(event: string, listener: Listener): void },
        event: string,
        listener: Listener,
      ) => {
        target.on(event, listener);
        listeners.push([target, event, listener]);
      };
      const ready = new Promise<number>((resolve, reject) => {
        let settled = false;
        const finish = (
          result: { ok: true; value: number } | { ok: false; error: Error },
        ) => {
          if (settled) return;
          settled = true;
          if (result.ok) resolve(result.value);
          else reject(result.error);
        };
        const fail = () =>
          finish({ ok: false, error: new MainIpcError('EXPORT_FAILED') });
        const abort = () =>
          finish({
            ok: false,
            error: new ApplicationError('OPERATION_ABORTED'),
          });
        const readyListener = (
          event: { readonly sender: unknown },
          raw: unknown,
        ) => {
          if (event.sender !== window.webContents) return;
          const parsed = exportRenderReadySchema.safeParse(raw);
          if (
            parsed.success &&
            parsed.data.operationId === value.operationId &&
            parsed.data.nonce === nonce
          ) {
            finish({ ok: true, value: parsed.data.lossyNodeCount });
          }
        };
        const failedListener = (
          event: { readonly sender: unknown },
          raw: unknown,
        ) => {
          if (event.sender !== window.webContents) return;
          const parsed = exportRenderFailureSchema.safeParse(raw);
          if (
            parsed.success &&
            parsed.data.operationId === value.operationId &&
            parsed.data.nonce === nonce
          ) {
            fail();
          }
        };
        input.ipc.on(EXPORT_RENDER_CHANNELS.ready, readyListener);
        input.ipc.on(EXPORT_RENDER_CHANNELS.failed, failedListener);
        listeners.push([
          input.ipc,
          EXPORT_RENDER_CHANNELS.ready,
          readyListener,
        ]);
        listeners.push([
          input.ipc,
          EXPORT_RENDER_CHANNELS.failed,
          failedListener,
        ]);
        listen(window.webContents, 'did-finish-load', () => {
          window.webContents.send(EXPORT_RENDER_CHANNELS.document, payload);
        });
        listen(window.webContents, 'did-fail-load', fail);
        listen(window.webContents, 'render-process-gone', fail);
        listen(window, 'unresponsive', fail);
        listen(window, 'closed', fail);
        controller.signal.addEventListener('abort', abort, { once: true });
        listeners.push([controller.signal, 'abort', abort]);
        timeout = input.scheduler.setTimeout(fail, 60_000);
        Promise.resolve(window.loadURL(input.pageUrl)).catch(fail);
      });

      try {
        const rendererLossy = await ready;
        if (controller.signal.aborted)
          throw new ApplicationError('OPERATION_ABORTED');
        const printed = await window.webContents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        const processed = await secureExportPdf({
          bytes: Uint8Array.from(printed),
          assets: value.assets,
          forbiddenValues: [nonce, input.pageUrl, input.preloadPath],
        });
        return {
          bytes: processed.bytes,
          lossyNodeCount: rendererLossy + processed.lossyNodeCount,
        };
      } finally {
        if (timeout !== undefined) input.scheduler.clearTimeout(timeout);
        listeners.forEach(([target, event, listener]) => {
          if (target === input.ipc)
            input.ipc.removeListener(event, listener as never);
          else if (target === controller.signal)
            controller.signal.removeEventListener(event, listener);
          else
            (
              target as {
                removeListener(event: string, listener: Listener): void;
              }
            ).removeListener(event, listener);
        });
        removeDenials();
        lease.close();
        if (!window.isDestroyed()) window.destroy();
      }
    })();

    const tracked = run
      .catch((error) => {
        throw mapped(error, controller.signal);
      })
      .finally(() => {
        value.signal.removeEventListener('abort', relayAbort);
        if (active?.promise === tracked) active = undefined;
      });
    active = { controller, promise: tracked };
    return tracked;
  };

  return Object.freeze({
    render,
    async close() {
      const current = active;
      if (current === undefined) return;
      current.controller.abort();
      await current.promise.catch(() => undefined);
    },
  });
}
