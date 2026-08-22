import {
  createSecureWindow,
  type BrowserWindowFactory,
  type SecureWindowPort,
} from '../window';

/* eslint-disable no-script-url */

function setup() {
  let navigate:
    | ((event: { preventDefault(): void }, url: string) => void)
    | undefined;
  let openWindow: ((input: { url: string }) => { action: 'deny' }) | undefined;
  let permissionRequest:
    | ((
        webContents: unknown,
        permission: string,
        callback: (allowed: boolean) => void,
      ) => void)
    | undefined;
  let permissionCheck: (() => boolean) | undefined;
  const session = {
    setPermissionRequestHandler: jest.fn((handler) => {
      permissionRequest = handler;
    }),
    setPermissionCheckHandler: jest.fn((handler) => {
      permissionCheck = handler;
    }),
  };
  const window = {
    loadURL: jest.fn(async () => undefined),
    on: jest.fn(),
    show: jest.fn(),
    minimize: jest.fn(),
    webContents: {
      session,
      on: jest.fn((event, listener) => {
        if (event === 'will-navigate') navigate = listener;
      }),
      setWindowOpenHandler: jest.fn((handler) => {
        openWindow = handler;
      }),
    },
  } as unknown as SecureWindowPort;
  let options: Record<string, unknown> | undefined;
  const factory: BrowserWindowFactory = {
    create: jest.fn((value) => {
      options = value as unknown as Record<string, unknown>;
      return window;
    }),
  };
  const shell = { openExternal: jest.fn(async () => undefined) };
  const created = createSecureWindow({
    factory,
    shell,
    preloadPath: 'D:\\app\\preload.js',
    entryUrl: 'https://notera.local/index.html',
  });
  return {
    created,
    window,
    options,
    shell,
    get navigate() {
      if (navigate === undefined) throw new Error('Navigate handler missing.');
      return navigate;
    },
    get openWindow() {
      if (openWindow === undefined) throw new Error('Open handler missing.');
      return openWindow;
    },
    get permissionRequest() {
      if (permissionRequest === undefined)
        throw new Error('Permission handler missing.');
      return permissionRequest;
    },
    get permissionCheck() {
      if (permissionCheck === undefined)
        throw new Error('Permission check missing.');
      return permissionCheck;
    },
  };
}

describe('secure BrowserWindow', () => {
  it('sets all five explicit web security options and loads the app entry', () => {
    const state = setup();
    expect(state.created).toBe(state.window);
    expect(state.options).toMatchObject({
      webPreferences: {
        preload: 'D:\\app\\preload.js',
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    expect(state.window.loadURL).toHaveBeenCalledWith(
      'https://notera.local/index.html',
    );
  });

  it('allows same-origin navigation and prevents cross-origin navigation', () => {
    const state = setup();
    const sameOrigin = { preventDefault: jest.fn() };
    state.navigate(sameOrigin, 'https://notera.local/notes?id=1');
    expect(sameOrigin.preventDefault).not.toHaveBeenCalled();

    const crossOrigin = { preventDefault: jest.fn() };
    state.navigate(crossOrigin, 'https://evil.example/');
    expect(crossOrigin.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    'http://example.com',
    'file:///D:/private.txt',
    'javascript:alert(1)',
    'notera-media://preview/token',
  ])('denies external protocol %s without opening it', async (url) => {
    const state = setup();
    expect(state.openWindow({ url })).toEqual({ action: 'deny' });
    await Promise.resolve();
    expect(state.shell.openExternal).not.toHaveBeenCalled();
  });

  it('opens only https externally while always denying a child window', async () => {
    const state = setup();
    expect(state.openWindow({ url: 'https://example.com/help' })).toEqual({
      action: 'deny',
    });
    await Promise.resolve();
    expect(state.shell.openExternal).toHaveBeenCalledWith(
      'https://example.com/help',
    );
  });

  it('denies permission checks and requests by default', () => {
    const state = setup();
    const callback = jest.fn();
    state.permissionRequest({}, 'camera', callback);
    expect(callback).toHaveBeenCalledWith(false);
    expect(state.permissionCheck()).toBe(false);
  });
});
