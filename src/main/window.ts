export interface SecureWindowPort {
  loadURL(url: string): Promise<unknown> | unknown;
  on(event: string, listener: () => void): void;
  show(): void;
  minimize(): void;
  readonly webContents: {
    readonly session: {
      setPermissionRequestHandler(
        handler: (
          webContents: unknown,
          permission: string,
          callback: (allowed: boolean) => void,
        ) => void,
      ): void;
      setPermissionCheckHandler(handler: () => boolean): void;
    };
    on(
      event: 'will-navigate',
      listener: (event: { preventDefault(): void }, url: string) => void,
    ): void;
    setWindowOpenHandler(
      handler: (input: { readonly url: string }) => { action: 'deny' },
    ): void;
  };
}

export interface BrowserWindowFactory {
  create(options: {
    readonly show: boolean;
    readonly width: number;
    readonly minWidth: number;
    readonly height: number;
    readonly icon?: string;
    readonly webPreferences: {
      readonly preload: string;
      readonly additionalArguments?: readonly string[];
      readonly contextIsolation: true;
      readonly sandbox: true;
      readonly nodeIntegration: false;
      readonly webSecurity: true;
    };
  }): SecureWindowPort;
}

export interface ExternalShellPort {
  openExternal(url: string): Promise<unknown>;
}

function allowsNavigation(entryUrl: string, candidateUrl: string): boolean {
  try {
    const entry = new URL(entryUrl);
    const candidate = new URL(candidateUrl);
    if (entry.origin !== 'null') return candidate.origin === entry.origin;
    return (
      candidate.protocol === entry.protocol &&
      candidate.host === entry.host &&
      candidate.pathname === entry.pathname
    );
  } catch {
    return false;
  }
}

export function createSecureWindow(input: {
  readonly factory: BrowserWindowFactory;
  readonly shell: ExternalShellPort;
  readonly preloadPath: string;
  readonly entryUrl: string;
  readonly iconPath?: string;
  readonly additionalArguments?: readonly string[];
}): SecureWindowPort {
  const window = input.factory.create({
    show: false,
    width: 1280,
    minWidth: 1120,
    height: 728,
    ...(input.iconPath === undefined ? {} : { icon: input.iconPath }),
    webPreferences: {
      preload: input.preloadPath,
      ...(input.additionalArguments === undefined
        ? {}
        : { additionalArguments: input.additionalArguments }),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!allowsNavigation(input.entryUrl, url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === 'https:') {
        input.shell.openExternal(url).catch(() => undefined);
      }
    } catch {
      // Invalid external URLs remain denied.
    }
    return { action: 'deny' };
  });
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.on('ready-to-show', () => {
    if (process.env.START_MINIMIZED) window.minimize();
    else window.show();
  });
  Promise.resolve(window.loadURL(input.entryUrl)).catch(() => undefined);
  return window;
}
