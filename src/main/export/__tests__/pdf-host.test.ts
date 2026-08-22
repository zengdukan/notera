import { PDFDocument } from 'pdf-lib';

import { createPdfRenderHost, type PdfHostWindowPort } from '../pdf-host';

const operationId = '10000000-0000-4000-8000-000000000001';
const profileId = '30000000-0000-4000-8000-000000000003';

async function setup() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const printed = await pdf.save({ useObjectStreams: false });
  const windowEvents = new Map<string, (...args: any[]) => void>();
  const contentEvents = new Map<string, (...args: any[]) => void>();
  const ipcEvents = new Map<string, (...args: any[]) => void>();
  let timeoutCallback: (() => void) | undefined;
  let permissionRequest: ((...args: any[]) => void) | undefined;
  let permissionCheck: (() => boolean) | undefined;
  let openWindow: ((...args: any[]) => unknown) | undefined;
  let download: ((event: { preventDefault(): void }) => void) | undefined;
  const protocol = { handle: jest.fn(), unhandle: jest.fn() };
  const session = {
    protocol,
    setPermissionRequestHandler: jest.fn((handler) => {
      permissionRequest = handler;
    }),
    setPermissionCheckHandler: jest.fn((handler) => {
      permissionCheck = handler;
    }),
    on: jest.fn((event, handler) => {
      if (event === 'will-download') download = handler;
    }),
  };
  const webContents = {
    id: 7,
    session,
    send: jest.fn(),
    printToPDF: jest.fn(async () => Buffer.from(printed)),
    on: jest.fn((event, handler) => contentEvents.set(event, handler)),
    removeListener: jest.fn((event, handler) => {
      if (contentEvents.get(event) === handler) contentEvents.delete(event);
    }),
    setWindowOpenHandler: jest.fn((handler) => {
      openWindow = handler;
    }),
  };
  let destroyed = false;
  const window = {
    webContents,
    loadURL: jest.fn(async () => undefined),
    destroy: jest.fn(() => {
      destroyed = true;
    }),
    isDestroyed: jest.fn(() => destroyed),
    on: jest.fn((event, handler) => windowEvents.set(event, handler)),
    removeListener: jest.fn((event, handler) => {
      if (windowEvents.get(event) === handler) windowEvents.delete(event);
    }),
  } as unknown as PdfHostWindowPort;
  let options: unknown;
  const host = createPdfRenderHost({
    factory: {
      create(value: unknown) {
        options = value;
        return window;
      },
    },
    ipc: {
      on: jest.fn((channel, handler) => ipcEvents.set(channel, handler)),
      removeListener: jest.fn((channel, handler) => {
        if (ipcEvents.get(channel) === handler) ipcEvents.delete(channel);
      }),
    },
    service: {
      importAttachment: jest.fn(),
      listForNote: jest.fn(),
      removeFromNote: jest.fn(),
      collectGarbage: jest.fn(),
      openReader: jest.fn(),
    },
    getSessionState: () => ({
      state: 'UNLOCKED' as const,
      localProfileId: profileId as never,
      displayName: 'Profile',
      rootFolderId: '40000000-0000-4000-8000-000000000004' as never,
    }),
    randomBytes: () => Uint8Array.from({ length: 32 }, () => 1),
    now: () => 100,
    scheduler: {
      setTimeout(callback: () => void) {
        timeoutCallback = callback;
        return 1;
      },
      clearTimeout: jest.fn(),
    },
    preloadPath: 'D:\\app\\export-preload.js',
    pageUrl: 'file:///D:/app/renderer/export.html',
  });

  const render = (signal = new AbortController().signal) =>
    host.render({
      operationId,
      title: 'Saved title',
      document: { type: 'doc', version: 1 },
      assets: [],
      signal,
      onResourceBytes: jest.fn(),
    });
  const emitReady = (
    payload: Record<string, unknown>,
    sender: unknown = webContents,
  ) => ipcEvents.get('notera:export-render:ready')?.({ sender }, payload);

  return {
    host,
    render,
    emitReady,
    window,
    webContents,
    protocol,
    get options() {
      return options;
    },
    emitContent(event: string, ...args: unknown[]) {
      contentEvents.get(event)?.(...args);
    },
    failRenderer(payload: Record<string, unknown>) {
      ipcEvents.get('notera:export-render:failed')?.(
        { sender: webContents },
        payload,
      );
    },
    timeout() {
      if (timeoutCallback === undefined) throw new Error('timeout missing');
      timeoutCallback();
    },
    get permissionRequest() {
      return permissionRequest!;
    },
    get permissionCheck() {
      return permissionCheck!;
    },
    get openWindow() {
      return openWindow!;
    },
    get download() {
      return download!;
    },
  };
}

describe('one-shot PDF render host', () => {
  it('uses an isolated secure window and accepts only matching renderer ready', async () => {
    const state = await setup();
    const pending = state.render();
    await Promise.resolve();

    expect(state.options).toMatchObject({
      show: false,
      webPreferences: {
        preload: 'D:\\app\\export-preload.js',
        partition: `notera-export-${operationId}`,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        devTools: false,
      },
    });
    state.emitContent('did-finish-load');
    const payload = (state.webContents.send as jest.Mock).mock.calls[0][1];
    expect(payload.mediaBaseUrl).toMatch(
      new RegExp(
        `^notera-export-media://${operationId}/[A-Za-z0-9_-]{43}$`,
        'u',
      ),
    );

    state.emitReady(
      { operationId, nonce: payload.nonce, lossyNodeCount: 9 },
      { id: 999 },
    );
    state.emitReady({ operationId, nonce: 'x'.repeat(43), lossyNodeCount: 9 });
    expect(state.webContents.printToPDF).not.toHaveBeenCalled();

    state.emitReady({ operationId, nonce: payload.nonce, lossyNodeCount: 2 });
    const result = await pending;
    expect(result.lossyNodeCount).toBe(2);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(state.webContents.printToPDF).toHaveBeenCalledWith({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    expect(state.protocol.unhandle).toHaveBeenCalledWith('notera-export-media');
    expect(state.window.destroy).toHaveBeenCalledTimes(1);
  });

  it('fixes navigation, child-window, permission, and download denial', async () => {
    const state = await setup();
    const pending = state.render();
    await Promise.resolve();
    const navigation = { preventDefault: jest.fn() };
    state.emitContent('will-navigate', navigation, 'https://evil.example');
    expect(navigation.preventDefault).toHaveBeenCalled();
    expect(state.openWindow({ url: 'https://example.com' })).toEqual({
      action: 'deny',
    });
    const permission = jest.fn();
    state.permissionRequest({}, 'camera', permission);
    expect(permission).toHaveBeenCalledWith(false);
    expect(state.permissionCheck()).toBe(false);
    const download = { preventDefault: jest.fn() };
    state.download(download);
    expect(download.preventDefault).toHaveBeenCalled();

    state.timeout();
    await expect(pending).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
  });

  it.each(['render-process-gone', 'unresponsive', 'did-fail-load'])(
    'cleans up after %s',
    async (event) => {
      const state = await setup();
      const pending = state.render();
      await Promise.resolve();
      if (event === 'unresponsive') {
        (state.window.on as jest.Mock).mock.calls.find(
          ([name]) => name === event,
        )?.[1]();
      } else {
        state.emitContent(event);
      }
      await expect(pending).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
      expect(state.protocol.unhandle).toHaveBeenCalledTimes(1);
      expect(state.window.destroy).toHaveBeenCalledTimes(1);
    },
  );

  it('maps abort and print failures while always cleaning up', async () => {
    const abortedState = await setup();
    const controller = new AbortController();
    const aborted = abortedState.render(controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: 'OPERATION_ABORTED' });
    expect(abortedState.window.destroy).toHaveBeenCalledTimes(1);

    const printState = await setup();
    (printState.webContents.printToPDF as jest.Mock).mockRejectedValue(
      new Error('private print failure'),
    );
    const printing = printState.render();
    await Promise.resolve();
    printState.emitContent('did-finish-load');
    const payload = (printState.webContents.send as jest.Mock).mock.calls[0][1];
    printState.emitReady({
      operationId,
      nonce: payload.nonce,
      lossyNodeCount: 0,
    });
    await expect(printing).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
    expect(printState.window.destroy).toHaveBeenCalledTimes(1);
  });
});
